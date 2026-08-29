import { scoreBullet } from "./bullet-matcher";
import { norm, type Bullet, type JdExtract, type MasterCv } from "./types";

/**
 * A tailored CV is a DIFF from the role-family master (token rule #4):
 * bullets in/out by id, keywords to mirror, one rewritten summary line.
 */
export interface CvDiff {
  addBulletIds: string[];
  removeBulletIds: string[];
  keywordsToMirror: string[];
  summaryLine: string;
}

export interface ApplicationCv {
  bulletIds: string[];
  summaryLine: string;
  baseMasterVersion: number;
}

/**
 * Build the diff. Honesty rule: a JD keyword is mirrored only when it is
 * evidenced somewhere in the bullet bank (a skill tag or bullet text) -
 * the CV never claims what the repository cannot back.
 */
export function buildDiff(
  master: MasterCv,
  candidates: Bullet[],
  bank: Record<string, Bullet>,
  jd: JdExtract,
  sectorSummary: string,
): CvDiff {
  const inMaster = new Set(master.bulletIds);

  const addBulletIds = candidates.map((b) => b.id).filter((id) => !inMaster.has(id));

  const removeBulletIds = master.bulletIds.filter((id) => {
    const b = bank[id];
    return b ? scoreBullet(b, jd) === 0 : false;
  });

  const evidence = new Set<string>();
  for (const b of Object.values(bank)) {
    for (const s of b.skills) evidence.add(norm(s));
  }
  const evidencedInText = (kw: string) =>
    Object.values(bank).some((b) => norm(b.text).includes(kw));
  const keywordsToMirror = jd.keywords
    .map(norm)
    .filter((kw) => evidence.has(kw) || evidencedInText(kw));

  const sectorHint = sectorSummary ? ` ${sectorSummary.split(".")[0]}.` : "";
  const summaryLine = `${master.summaryLine.replace(/\.$/, "")}, targeting ${jd.role} at ${jd.company}.${sectorHint}`.trim();

  return { addBulletIds, removeBulletIds, keywordsToMirror, summaryLine };
}

/** Apply a diff: master order kept, removals dropped, additions appended. */
export function applyDiff(master: MasterCv, diff: CvDiff): ApplicationCv {
  const remove = new Set(diff.removeBulletIds);
  const bulletIds = [
    ...master.bulletIds.filter((id) => !remove.has(id)),
    ...diff.addBulletIds.filter((id) => !master.bulletIds.includes(id)),
  ];
  return { bulletIds, summaryLine: diff.summaryLine, baseMasterVersion: master.version };
}
