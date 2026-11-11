import { scoreBullet, selectBullets } from "../bullet-matcher";
import { applyDiff, buildDiff, type CvDiff } from "../cv-diff";
import { composeSelection, fitToPage, type EditorialBullet, type FitAction, type PageFit, type PageSize } from "../editorial";
import type { Application, JdExtract, MasterCv, Project } from "../types";
import type { DbClient } from "../repos/db";
import { getApplication, updateApplication } from "../repos/applications";
import { getLatestMasterCv, insertApplicationCv, listLatestMasterCvs } from "../repos/cvs";
import { getProfile } from "../repos/profiles";
import { listProjects } from "../repos/projects";
import { getSectorByPath } from "../repos/sectors";
import type { StoredApplicationCv } from "../repos/rows";

/** Page settings for fitting (DESIGN §2 page-fit model). Supplied by the caller from config. */
export interface CvPageSettings {
  pageSize: PageSize;
  scale: number;
  /** Lines taken by everything that is not a bullet: header, education, skills, headings. */
  overheadLines: number;
}

export interface TailorCvDeps {
  db: DbClient;
  /** When absent the page is not fitted (and nothing is cut for space). */
  page?: CvPageSettings;
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
 * the keyword honesty rule), then run the editorial layer - per-org caps from
 * profile data, and when page settings are given, short variants before any
 * cut (CLAUDE.md rule 3). Persist it and link it to the application.
 * No LLM here - polish is a later, separate premium-tier step.
 */
export async function tailorCv(
  { db, page }: TailorCvDeps,
  userId: string,
  applicationId: string,
  now: string,
): Promise<TailorCvResult> {
  const app = await getApplication(db, userId, applicationId);
  if (!app) throw new Error(`tailorCv: application ${applicationId} not found`);
  const jd = app.jdExtract;
  if (!jd) throw new Error(`tailorCv: application ${applicationId} has no JD extract`);

  const [projects, profile, sector, exact] = await Promise.all([
    listProjects(db, userId),
    getProfile(db, userId),
    getSectorByPath(db, userId, jd.sectorPath),
    getLatestMasterCv(db, userId, jd.roleFamily),
  ]);
  // Role families are free text from extraction, so a JD can name one the user has no
  // master for ("account-management"). Start from the master that already fits it best.
  const master = exact ?? bestFittingMaster(await listLatestMasterCvs(db, userId), projects, jd);
  if (!master) throw new Error("tailorCv: no master CV yet - add one before tailoring");
  const candidates = selectBullets(projects, jd, CANDIDATE_BULLETS);
  const bank: Record<string, EditorialBullet> = Object.fromEntries(
    projects.flatMap((p) => p.bullets.map((b) => [b.id, { ...b, orgId: p.org }] as const)),
  );

  const draft = buildDiff(master, candidates, bank, jd, sector?.summary ?? "");

  // Editorial layer: the zero-score master bullets buildDiff removes become excludes,
  // so every bullet still gets a recorded decision.
  const selection = composeSelection({
    masterBulletIds: master.bulletIds,
    candidates: [...master.bulletIds, ...candidates.map((b) => b.id)]
      .filter((id) => bank[id])
      .map((id) => ({ bulletId: id, score: scoreBullet(bank[id]!, jd) })),
    bank,
    orgCaps: profile?.orgCaps ?? {},
    excludes: draft.removeBulletIds,
  });

  let bulletIds = selection.bulletIds;
  let variants: Record<string, string> = {};
  let actions: FitAction[] = [];
  let fit: PageFit | null = null;
  if (page) {
    const fitted = fitToPage(selection, bank, { ...page, summaryLine: draft.summaryLine });
    ({ bulletIds, variants, actions, fit } = fitted);
  }

  const kept = new Set(bulletIds);
  const diff: CvDiff = {
    addBulletIds: bulletIds.filter((id) => !master.bulletIds.includes(id)),
    removeBulletIds: master.bulletIds.filter((id) => !kept.has(id)),
    keywordsToMirror: draft.keywordsToMirror,
    summaryLine: draft.summaryLine,
    ...(Object.keys(variants).length ? { variants } : {}),
    editorial: { decisions: selection.decisions, actions, fit },
  };
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

/** The master whose bullets score highest against the JD; ties keep list order. */
function bestFittingMaster(masters: MasterCv[], projects: Project[], jd: JdExtract): MasterCv | null {
  const bullets = new Map(projects.flatMap((p) => p.bullets.map((b) => [b.id, b] as const)));
  const fit = (m: MasterCv) =>
    m.bulletIds.reduce((sum, id) => sum + (bullets.has(id) ? scoreBullet(bullets.get(id)!, jd) : 0), 0);
  let best: MasterCv | null = null;
  let bestScore = -1;
  for (const m of masters) {
    const score = fit(m);
    if (score > bestScore) [best, bestScore] = [m, score];
  }
  return best;
}
