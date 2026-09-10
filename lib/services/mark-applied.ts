import { advance } from "../pipeline";
import { snapshotCv } from "../freeze";
import type { Application } from "../types";
import { one, type DbClient } from "../repos/db";
import { getApplication, updateApplication } from "../repos/applications";
import { getApplicationCv } from "../repos/cvs";
import { listProjects } from "../repos/projects";

export interface MarkAppliedDeps {
  db: DbClient;
}

export interface MarkAppliedResult {
  application: Application;
  /** True only on the pass that wrote the snapshot; false if already frozen or no CV. */
  frozen: boolean;
}

/**
 * The `applied` transition is the freeze point (DESIGN.md section 6, "two
 * load-bearing joints"): it stamps appliedAt once (pipeline.advance) and
 * snapshots the sent CV once. A second pass through `applied` changes neither.
 * The transition itself is never blocked by a missing CV - the user may have
 * applied with a document made elsewhere; we just have nothing to freeze.
 */
export async function markApplied(
  { db }: MarkAppliedDeps,
  userId: string,
  applicationId: string,
  nowIso: string,
): Promise<MarkAppliedResult> {
  const app = await getApplication(db, userId, applicationId);
  if (!app) throw new Error(`markApplied: application ${applicationId} not found`);

  const today = nowIso.slice(0, 10);
  const advanced = advance(app, "applied", today);
  const application = await updateApplication(db, userId, { ...advanced, updatedAt: today });

  if (!application.cvVersionId) return { application, frozen: false };
  const cv = await getApplicationCv(db, userId, application.cvVersionId);
  if (!cv || cv.sentAt) return { application, frozen: false };

  const projects = await listProjects(db, userId);
  const bank = Object.fromEntries(projects.flatMap((p) => p.bullets).map((b) => [b.id, b]));
  const snapshot = snapshotCv(cv, bank);

  await one(
    db
      .from("application_cvs")
      .update({ sent_snapshot: snapshot, sent_at: nowIso })
      .eq("user_id", userId)
      .eq("id", cv.id)
      .select()
      .single(),
    "application_cvs",
    "freeze",
  );
  return { application, frozen: true };
}
