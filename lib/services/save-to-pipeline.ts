import type { LlmProvider } from "../adapters/llm";
import type { DbClient } from "../repos/db";
import { findApplicationByExternalRef, setSyncFields } from "../repos/applications";
import { listSourcedJobs, setSourcedJobStatus } from "../repos/sourced-jobs";
import { listWatchlist } from "../repos/watchlist";
import { norm } from "../types";
import type { AtsKind } from "../watchlist/ats";
import { processJd } from "./process-jd";

/**
 * Save a watchlist role to the pipeline in one step (docs/APPLY-FLOW.md step 3): read the
 * posting's full text from its board, read it once into what the role asks for (processJd),
 * open an application at Saved with the posting link, build the CV (rules only, free) and mark
 * the role tracked. Saving twice opens the same application.
 */

export interface PostingQuery {
  ats: Exclude<AtsKind, "unknown">;
  token: string;
  externalId: string;
  company: string;
}

export interface SaveToPipelineDeps {
  db: DbClient;
  llm: LlmProvider;
  /** The posting's text from its board, or null when the board has none. */
  readPosting: (q: PostingQuery) => Promise<string | null>;
  /** Tailor the CV for the new application. A failure is reported, never fatal. */
  buildCv: (applicationId: string) => Promise<void>;
}

export type SaveToPipelineResult =
  | { applicationId: string; created: boolean; cvError?: string }
  | { needsPosting: true; url: string | null };

/** The application's external_ref for a sourced role, so it is found again. */
export const sourcedRef = (jobId: string) => `sourced:${jobId}`;

/** The sourced role id behind an application's external_ref, or null for any other ref. */
export const sourcedJobIdOf = (ref: string | null): string | null => (ref?.startsWith("sourced:") ? ref.slice("sourced:".length) : null);

const READABLE = new Set<string>(["greenhouse", "lever", "ashby", "smartrecruiters"]);

export async function saveToPipeline(
  deps: SaveToPipelineDeps,
  userId: string,
  jobId: string,
  now: string,
): Promise<SaveToPipelineResult> {
  const { db } = deps;
  const job = (await listSourcedJobs(db, userId)).find((j) => j.id === jobId);
  if (!job) throw new Error(`saveToPipeline: role ${jobId} not found`);

  const existing = await findApplicationByExternalRef(db, userId, sourcedRef(job.id));
  if (existing) return { applicationId: existing.id, created: false };

  const entry = READABLE.has(job.source)
    ? (await listWatchlist(db, userId)).find((w) => w.ats === job.source && w.token && norm(w.company) === norm(job.company))
    : undefined;
  const text =
    entry?.token && job.externalId
      ? await deps.readPosting({ ats: job.source as PostingQuery["ats"], token: entry.token, externalId: job.externalId, company: job.company })
      : null;
  if (!text) return { needsPosting: true, url: job.url };

  const { application } = await processJd({ db, llm: deps.llm }, userId, text, now);
  await setSyncFields(db, userId, application.id, { externalRef: sourcedRef(job.id), applyUrl: job.url });
  await setSourcedJobStatus(db, userId, job.id, "tracked");

  let cvError: string | undefined;
  try {
    await deps.buildCv(application.id);
  } catch (err) {
    cvError = err instanceof Error ? err.message.replace(/^tailorCv:\s*/, "") : "The CV could not be built.";
  }
  return { applicationId: application.id, created: true, ...(cvError ? { cvError } : {}) };
}
