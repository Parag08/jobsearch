import { selectBullets } from "../bullet-matcher";
import { applyDiff, buildDiff, type CvDiff } from "../cv-diff";
import type { Application } from "../types";
import type { DbClient } from "../repos/db";
import { getApplication, updateApplication } from "../repos/applications";
import { getLatestMasterCv, insertApplicationCv } from "../repos/cvs";
import { listProjects } from "../repos/projects";
import { getSectorByPath } from "../repos/sectors";
import type { StoredApplicationCv } from "../repos/rows";

export interface TailorCvDeps {
  db: DbClient;
}

export interface TailorCvResult {
  application: Application;
  cv: StoredApplicationCv;
  diff: CvDiff;
}

/** How many top-scoring bullets to consider adding on top of the master. */
const CANDIDATE_BULLETS = 6;

/**
 * CV tailoring (behind POST /api/cv-diff): score the bullet bank against the
 * application's stored JdExtract, build the diff-from-master (buildDiff keeps
 * the keyword honesty rule), persist it, and link it to the application.
 * No LLM here - polish is a later, separate premium-tier step.
 */
export async function tailorCv(
  { db }: TailorCvDeps,
  userId: string,
  applicationId: string,
  now: string,
): Promise<TailorCvResult> {
  const app = await getApplication(db, userId, applicationId);
  if (!app) throw new Error(`tailorCv: application ${applicationId} not found`);
  const jd = app.jdExtract;
  if (!jd) throw new Error(`tailorCv: application ${applicationId} has no JD extract`);

  const master = await getLatestMasterCv(db, userId, jd.roleFamily);
  if (!master) throw new Error(`tailorCv: no master CV for role family "${jd.roleFamily}"`);

  const projects = await listProjects(db, userId);
  const candidates = selectBullets(projects, jd, CANDIDATE_BULLETS);
  const bank = Object.fromEntries(projects.flatMap((p) => p.bullets).map((b) => [b.id, b]));
  const sector = await getSectorByPath(db, userId, jd.sectorPath);

  const diff = buildDiff(master, candidates, bank, jd, sector?.summary ?? "");
  const applied = applyDiff(master, diff);

  const cv = await insertApplicationCv(db, userId, {
    masterCvId: master.id,
    diff,
    bulletIds: applied.bulletIds,
    summaryLine: applied.summaryLine,
    filePath: null,
  });

  const application = await updateApplication(db, userId, {
    ...app,
    cvVersionId: cv.id,
    updatedAt: now,
  });

  return { application, cv, diff };
}
