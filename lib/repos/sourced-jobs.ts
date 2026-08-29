import type { SourcedJob } from "../types";
import { many, one, type DbClient } from "./db";
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

export async function listSourcedJobs(
  db: DbClient,
  userId: string,
  status?: SourcedJob["status"],
): Promise<SourcedJob[]> {
  let q = db.from("sourced_jobs").select().eq("user_id", userId);
  if (status) q = q.eq("status", status);
  const rows = await many(q.order("score", { ascending: false }), "sourced_jobs", "list");
  return rows.map(toSourcedJob);
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
