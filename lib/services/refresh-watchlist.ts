import { norm, type SectorNode, type SourcedJob } from "../types";
import type { DbClient } from "../repos/db";
import { listApplications } from "../repos/applications";
import { listContacts } from "../repos/contacts";
import { getProfile } from "../repos/profiles";
import { listProjects } from "../repos/projects";
import { listSectors } from "../repos/sectors";
import { applyRetirement, listTrackedJobs, upsertSourcedJobs } from "../repos/sourced-jobs";
import { listWatchlist } from "../repos/watchlist";
import { listSourcingCompanies } from "../repos/sourcing";
import { oneOrNull } from "../repos/db";
import { safePostingUrl, safeRoleLabel } from "../watchlist/daily";
import type { BoardFetcher } from "../watchlist/fetcher";
import { dedupeJobs, excludeAlreadyInPipeline } from "../watchlist/identity";
import { mapBoardPayload } from "../watchlist/mappers";
import { scoreSourcedJob } from "../watchlist/scoring";
import { planRetirement, type AnsweredBoard } from "../watchlist/retire";
import { filterToTargets } from "../watchlist/targets";
import type { WatchlistEntry } from "../watchlist/types";

export interface RefreshWatchlistDeps {
  db: DbClient;
  fetcher: BoardFetcher;
}

export interface BoardFailure {
  entryId: string;
  company: string;
  error: string;
}

export interface RefreshWatchlistResult {
  /** Postings mapped from every board that answered. */
  fetched: number;
  /** Dropped as cross-source duplicates (same canonical URL or company|title|location). */
  deduped: number;
  /** Dropped as outside the profile's target cities or titles (lib/watchlist/targets.ts). */
  filtered: number;
  /** Dropped because an application (any stage) already exists for company + title. */
  excluded: number;
  /** Rows written to sourced_jobs (updates on re-run, never duplicates). */
  upserted: number;
  /** Rows marked closed: missing from a board that answered, RETIRE_AFTER_MISSES times running. */
  retired: number;
  /** Boards that failed - one failure never aborts the others. */
  failures: BoardFailure[];
}

/**
 * Stand-in sector node when the user has no sector graph yet: no known
 * companies, and a geography that no real location string contains, so it
 * contributes nothing to the score.
 */
const NEUTRAL_NODE: SectorNode = {
  id: "neutral",
  path: ["\u0000"],
  skills: {},
  companies: [],
  titles: [],
  jdCount: 0,
  summary: "",
};

/**
 * Watchlist refresh (DESIGN.md section 4; the daily cron behind it):
 * active entries -> each ATS board (keyless public JSON) -> map by ATS ->
 * keep only the profile's target cities and titles -> cross-source dedupe ->
 * drop anything already in the pipeline -> score with
 * the declared-target boost -> upsert into sourced_jobs. Zero LLM tokens.
 */
export async function refreshWatchlist(
  { db, fetcher }: RefreshWatchlistDeps,
  userId: string,
  _today: string,
): Promise<RefreshWatchlistResult> {
  const [profile, boards, applications, contacts, projects, sectors, tracked, companies] = await Promise.all([
    getProfile(db, userId),
    listWatchlist(db, userId, { active: true }),
    listApplications(db, userId),
    listContacts(db, userId),
    listProjects(db, userId),
    listSectors(db, userId),
    listTrackedJobs(db, userId),
    listSourcingCompanies(db, userId),
  ]);

  const ids = new Set(companies.filter((company) => company.active).map((company) => company.id));
  const names = new Set(companies.filter((company) => company.active).map((company) => company.identity));
  const watchlist = boards.filter((entry) => entry.companyId ? ids.has(entry.companyId) : names.has(norm(entry.company)));
  const configured = watchlist.filter((entry) => entry.ats !== "unknown" && entry.token);
  const attemptedAt = new Date().toISOString();
  const settled = await Promise.allSettled(configured.map((entry) => fetchAndMap(fetcher, entry)));
  const current = new Map((await listWatchlist(db, userId, { active: true })).map((entry) => [entry.id, entry.careersUrl]));
  const checks = settled.flatMap((result, index) => {
    const entry = configured[index]!;
    return current.get(entry.id) === entry.careersUrl ? [{ entry, result }] : [];
  });
  const failures: BoardFailure[] = [];
  const fetched: SourcedJob[] = [];
  const answered: AnsweredBoard[] = [];
  checks.forEach(({ entry, result: r }) => {
    if (r.status === "fulfilled") {
      fetched.push(...r.value);
      answered.push({ source: entry.ats, company: entry.company, url: entry.careersUrl });
    } else failures.push({ entryId: entry.id, company: entry.company, error: errorMessage(r.reason) });
  });

  const wanted = filterToTargets(fetched, {
    geos: profile?.targetGeos ?? [],
    titles: profile?.targetTitles ?? [],
    excludedTitles: profile?.excludedTitles ?? [],
  });
  const unique = dedupeJobs(wanted);
  const fresh = excludeAlreadyInPipeline(unique, applications);

  const ctx = {
    node: sectors[0] ?? NEUTRAL_NODE,
    evidencedSkills: evidencedSkills(projects),
    contacts,
    watchlist,
  };
  // Adapter ids are provisional: drop them so the repo's (source, external_id) upsert owns identity.
  // A refresh never overrides the user's decisions: an existing row keeps its status
  // (a closed one that reappears comes back as new).
  const priorStatus = new Map(tracked.map((t) => [`${t.source}|${t.externalId}`, t.status]));
  const scored = fresh.map((job) => {
    const { id: _provisional, ...rest } = job;
    const prior = priorStatus.get(`${job.source}|${job.externalId}`);
    const status = prior && prior !== "closed" ? prior : rest.status;
    return { ...rest, status, score: scoreSourcedJob(job, ctx) };
  });

  const saved = scored.length ? await upsertSourcedJobs(db, userId, scored) : [];

  // Roles still listed are the ones that match the targets; anything else on an
  // answered board counts a miss (closed roles, and roles that no longer match).
  const updates = planRetirement(tracked, wanted, answered);
  await applyRetirement(db, userId, updates, new Map(tracked.map((job) => [job.id, job.status])));
  await Promise.all(checks.map(({ entry, result }) => oneOrNull(db.from("watchlist").update({
    last_attempt_at: attemptedAt,
    last_check_failed: result.status === "rejected",
    ...(result.status === "fulfilled" && { last_success_at: attemptedAt }),
  }).eq("user_id", userId).eq("id", entry.id).eq("careers_url", entry.careersUrl).eq("active", true)
    .select().maybeSingle(), "watchlist", "record check")));

  return {
    fetched: fetched.length,
    filtered: fetched.length - wanted.length,
    deduped: wanted.length - unique.length,
    excluded: unique.length - fresh.length,
    upserted: saved.length,
    retired: updates.filter((u) => u.status === "closed").length,
    failures,
  };
}

async function fetchAndMap(fetcher: BoardFetcher, entry: WatchlistEntry): Promise<SourcedJob[]> {
  const payload = await fetcher.fetchBoard(entry);
  return mapBoardPayload(entry.ats, payload, entry.company)
    .filter((job) => safeRoleLabel(job.title))
    .map((job) => ({ ...job, companyId: entry.companyId, sourcingBoardUrl: entry.careersUrl,
      location: safeRoleLabel(job.location, true), url: safePostingUrl(job.url) }));
}

/** Skills the bullet bank evidences: bullet skill tags plus project skill tags, deduped via norm(). */
function evidencedSkills(projects: Awaited<ReturnType<typeof listProjects>>): string[] {
  const seen = new Map<string, string>();
  for (const p of projects) {
    for (const s of [...p.skills, ...p.bullets.flatMap((b) => b.skills)]) {
      const k = norm(s);
      if (k && !seen.has(k)) seen.set(k, s);
    }
  }
  return [...seen.values()];
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
