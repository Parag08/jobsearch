import type { SourcedJob } from "../types";
import type { RetirementUpdate, TrackedJob } from "../watchlist/retire";
import { many, manyByPage, one, oneOrNull, type DbClient } from "./db";
import { sourcedJobRow, toSourcedJob } from "./rows";

/**
 * Feed ingestion (M7): upsert on (user, source, external_id) so re-running a
 * source updates scores/status-eligible fields instead of duplicating rows.
 * Domain ids on the way in are provisional (adapters synthesize them).
 */
export async function upsertSourcedJobs(
  db: DbClient,
  userId: string,
  jobs: Omit<SourcedJob, "id">[],
): Promise<SourcedJob[]> {
  const rows = await many(
    db
      .from("sourced_jobs")
      .upsert(jobs.map((j) => sourcedJobRow(userId, j)), { onConflict: "user_id,source,external_id" })
      .select(),
    "sourced_jobs",
    "upsert",
  );
  return rows.map(toSourcedJob);
}

const JOB_COLUMNS = "id,source,external_id,title,company,location,url,posted_at,score,status,company_id,sourcing_board_url";

export async function listSourcedJobs(
  db: DbClient,
  userId: string,
  status?: SourcedJob["status"],
): Promise<SourcedJob[]> {
  let q = db.from("sourced_jobs").select(JOB_COLUMNS).eq("user_id", userId);
  if (status) q = q.eq("status", status);
  const rows = await manyByPage(q.order("score", { ascending: false }).order("id"), "sourced_jobs", "list");
  return rows.map(toSourcedJob);
}

export async function getSourcedJob(db: DbClient, userId: string, id: string): Promise<SourcedJob | null> {
  const row = await oneOrNull(db.from("sourced_jobs").select(JOB_COLUMNS).eq("user_id", userId).eq("id", id).maybeSingle(),
    "sourced_jobs", "get");
  return row ? toSourcedJob(row) : null;
}

export async function setSourcedJobStatus(
  db: DbClient,
  userId: string,
  id: string,
  status: SourcedJob["status"],
): Promise<SourcedJob> {
  const row = await one(
    db.from("sourced_jobs").update({ status }).eq("user_id", userId).eq("id", id).select().single(),
    "sourced_jobs",
    "setStatus",
  );
  return toSourcedJob(row);
}

/** Every row with the fields retirement needs (lib/watchlist/retire.ts). */
export async function listTrackedJobs(db: DbClient, userId: string): Promise<TrackedJob[]> {
  const rows = await manyByPage(db.from("sourced_jobs").select("id,source,external_id,company,sourcing_board_url,status,missed_refreshes")
    .eq("user_id", userId).order("id"), "sourced_jobs", "listTracked");
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    externalId: r.external_id,
    company: r.company,
    sourcingBoardUrl: r.sourcing_board_url ?? null,
    status: r.status,
    missedRefreshes: r.missed_refreshes ?? 0,
  }));
}

/** Write planRetirement's updates: miss counts and any status change. */
export async function applyRetirement(
  db: DbClient, userId: string, updates: RetirementUpdate[], priorStatus: ReadonlyMap<string, SourcedJob["status"]>,
): Promise<void> {
  for (const u of updates) {
    const before = priorStatus.get(u.id);
    if (!before) continue;
    const row = db
        .from("sourced_jobs")
        .update({ missed_refreshes: u.missedRefreshes, status: u.status })
        .eq("user_id", userId)
        .eq("id", u.id).eq("status", before);
    const current = u.sourcingBoardUrl ? row.eq("sourcing_board_url", u.sourcingBoardUrl)
      : row.is("sourcing_board_url", null);
    await oneOrNull(current.select().maybeSingle(), "sourced_jobs", "retire");
  }
}
