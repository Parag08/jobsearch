import type { LlmProvider } from "../adapters/llm";
import type { DbClient } from "../repos/db";
import { findApplicationByExternalRef, getJdRaw, insertApplication, setSyncFields } from "../repos/applications";
import { listCompanies } from "../repos/companies";
import { listSourcedJobs, setSourcedJobStatus } from "../repos/sourced-jobs";
import { listWatchlist } from "../repos/watchlist";
import type { Application } from "../types";
import type { AtsKind } from "../watchlist/ats";
import { boardFor } from "../watchlist/posting";
import { processJd } from "./process-jd";
import { readRole } from "./read-role";

/**
 * Apply to a watchlist role in one step (docs/APPLY-FLOW.md steps 3-5). Always opens an
 * application at Saved with the posting link, so the user lands on a page to apply from:
 * - the posting is read from its board (watchlist entry, company directory, or the role's
 *   own board link names it), read once into what the role asks for, and the CV is built;
 * - with no text from the board it opens unread, and the application page asks for a paste;
 * - when the model fails the text is kept, so the page can read it again.
 * Applying twice opens the same application.
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

/** read: the posting was read; no-text: the board gave none (paste it); ai-failed: kept, not read. */
export type PostingRead = "read" | "no-text" | "ai-failed";

export interface SaveToPipelineResult {
  applicationId: string;
  created: boolean;
  read: PostingRead;
  cvError?: string;
}

/** The application's external_ref for a sourced role, so it is found again. */
export const sourcedRef = (jobId: string) => `sourced:${jobId}`;

/** The sourced role id behind an application's external_ref, or null for any other ref. */
export const sourcedJobIdOf = (ref: string | null): string | null => (ref?.startsWith("sourced:") ? ref.slice("sourced:".length) : null);

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
  if (existing) return { applicationId: existing.id, created: false, read: existing.jdExtract ? "read" : "no-text" };

  const [watchlist, directory] = await Promise.all([listWatchlist(db, userId), listCompanies(db).catch(() => [])]);
  const board = boardFor(job, watchlist, directory);
  const text = board
    ? await deps.readPosting({ ...board, company: job.company }).catch((err) => {
        console.error("saveToPipeline: board read failed", board.ats, board.token, err);
        return null;
      })
    : null;
  if (!board) console.warn("saveToPipeline: no readable board for", job.source, job.company, job.url);

  let application: Application;
  let read: PostingRead;
  if (text) {
    try {
      application = (await processJd({ db, llm: deps.llm }, userId, text, now)).application;
      read = "read";
    } catch (err) {
      console.error("saveToPipeline: reading the posting failed", err);
      application = await openUnread(db, userId, job.company, job.title, now, text);
      read = "ai-failed";
    }
  } else {
    application = await openUnread(db, userId, job.company, job.title, now, null);
    read = "no-text";
  }
  await setSyncFields(db, userId, application.id, { externalRef: sourcedRef(job.id), applyUrl: job.url });
  await setSourcedJobStatus(db, userId, job.id, "tracked");

  let cvError: string | undefined;
  if (read === "read") {
    try {
      await deps.buildCv(application.id);
    } catch (err) {
      cvError = err instanceof Error ? err.message.replace(/^tailorCv:\s*/, "") : "The CV could not be built.";
    }
  }
  return { applicationId: application.id, created: true, read, ...(cvError ? { cvError } : {}) };
}

function openUnread(db: DbClient, userId: string, company: string, role: string, now: string, jdRaw: string | null): Promise<Application> {
  return insertApplication(
    db,
    userId,
    {
      company,
      role,
      sectorId: null,
      stage: "saved",
      closedReason: null,
      jdExtract: null,
      cvVersionId: null,
      referralContactId: null,
      nextAction: null,
      savedAt: now.slice(0, 10),
      appliedAt: null,
      updatedAt: now,
    },
    jdRaw,
  );
}

/**
 * Read an application's posting from the page: the pasted text (stored first, so a failed read
 * keeps it), or the text already kept when none is pasted. Builds the CV once read. Never
 * throws for a model failure: the page shows the error.
 */
export async function readPostingInto(
  deps: Omit<SaveToPipelineDeps, "readPosting">,
  userId: string,
  applicationId: string,
  pasted: string,
): Promise<{ read: true; cvError?: string } | { read: false; error: string }> {
  const { db } = deps;
  const text = pasted.trim();
  if (text) await setSyncFields(db, userId, applicationId, { jdRaw: text });
  else if (!(await getJdRaw(db, userId, applicationId))?.trim()) return { read: false, error: "Paste the posting's text first." };
  try {
    if (!(await readRole({ db, llm: deps.llm }, userId, applicationId))) return { read: false, error: "Paste the posting's text first." };
  } catch (err) {
    console.error("readPostingInto: reading the posting failed", err);
    return { read: false, error: "The posting couldn't be read just now. It's saved: try again in a moment." };
  }
  try {
    await deps.buildCv(applicationId);
    return { read: true };
  } catch (err) {
    return { read: true, cvError: err instanceof Error ? err.message.replace(/^tailorCv:\s*/, "") : "The CV could not be built." };
  }
}
