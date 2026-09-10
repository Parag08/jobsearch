import { z } from "zod";
import { norm } from "../types";

/** One role at an org. Dates are ISO prefixes: "2021", "2021-03" or "2021-03-15"; end null = ongoing. */
export const SkeletonRoleSchema = z.object({
  title: z.string().min(1),
  start: z.string().min(4),
  end: z.string().nullable(),
  location: z.string().optional(),
  blurb: z.string().optional(),
});
export type SkeletonRole = z.infer<typeof SkeletonRoleSchema>;

export const SkeletonOrgSchema = z.object({
  name: z.string().min(1),
  roles: z.array(SkeletonRoleSchema),
});
export type SkeletonOrg = z.infer<typeof SkeletonOrgSchema>;

/** The career timeline (ONBOARDING.md §1, level 1): org -> roles[]. */
export const SkeletonSchema = z.object({ orgs: z.array(SkeletonOrgSchema) });
export type Skeleton = z.infer<typeof SkeletonSchema>;

export type DisagreementField = "org" | "title" | "start" | "end" | "location";

/** Where the two sources disagreed. Shown to the user; never resolved silently (ONBOARDING.md §3.2). */
export interface SkeletonDisagreement {
  /** The merged (LinkedIn) org name. */
  org: string;
  /** The merged (LinkedIn) role title; null for an org-level disagreement. */
  role: string | null;
  field: DisagreementField;
  linkedin: string | null;
  cv: string | null;
}

export interface SkeletonMerge {
  merged: Skeleton;
  disagreements: SkeletonDisagreement[];
}

// ---- dates ------------------------------------------------------------------

/** Month index from an ISO prefix; a bare year spans the whole year. NaN when unparseable. */
function monthRange(d: string | null, ongoingIfNull: boolean): { from: number; to: number } {
  if (d === null) return ongoingIfNull ? { from: -Infinity, to: Infinity } : { from: NaN, to: NaN };
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-\d{1,2})?$/.exec(d.trim());
  if (!m) return { from: NaN, to: NaN };
  const year = Number(m[1]) * 12;
  if (m[2] === undefined) return { from: year, to: year + 11 };
  const month = year + Number(m[2]) - 1;
  return { from: month, to: month };
}

/** Months two roles share; 0 when disjoint or unparseable, Infinity when both are ongoing. */
export function overlapMonths(a: Pick<SkeletonRole, "start" | "end">, b: Pick<SkeletonRole, "start" | "end">): number {
  const ra = { from: monthRange(a.start, false).from, to: monthRange(a.end, true).to };
  const rb = { from: monthRange(b.start, false).from, to: monthRange(b.end, true).to };
  const n = Math.min(ra.to, rb.to) - Math.max(ra.from, rb.from) + 1;
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

export function datesOverlap(a: Pick<SkeletonRole, "start" | "end">, b: Pick<SkeletonRole, "start" | "end">): boolean {
  return overlapMonths(a, b) > 0;
}

// ---- names ------------------------------------------------------------------

const LEGAL_SUFFIXES = new Set([
  "inc", "incorporated", "ltd", "limited", "llc", "llp", "plc", "pte", "pty", "gmbh", "ag", "sa", "bv", "nv",
  "corp", "corporation", "co", "company",
]);

/** Comparison key for an org: norm(), punctuation dropped, trailing legal suffixes removed. */
export function orgKey(name: string): string {
  const tokens = norm(name).replace(/[.,()]/g, " ").split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

function sameOrg(a: string, b: string): boolean {
  const ka = orgKey(a);
  const kb = orgKey(b);
  if (ka === kb) return true;
  const shorter = ka.length <= kb.length ? ka : kb;
  const longer = shorter === ka ? kb : ka;
  return shorter.length >= 3 && new RegExp(`(?<!\\S)${shorter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\S)`).test(longer);
}

function titleTokens(t: string): Set<string> {
  return new Set(norm(t).replace(/[^\p{L}\p{N} ]+/gu, " ").split(/\s+/).filter(Boolean));
}

/** Jaccard similarity of title word sets, 0..1. */
export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

const FUZZY_TITLE_MIN = 0.5;

/** Affinity between two roles: 0 = no match; higher = better. Exact title dominates, then overlap, then fuzz. */
function roleAffinity(a: SkeletonRole, b: SkeletonRole): number {
  const exact = norm(a.title) === norm(b.title);
  const months = overlapMonths(a, b);
  const sim = titleSimilarity(a.title, b.title);
  if (!exact && months === 0 && sim < FUZZY_TITLE_MIN) return 0;
  return (exact ? 1000 : 0) + Math.min(months, 600) + (sim >= FUZZY_TITLE_MIN ? sim * 10 : 0);
}

// ---- merge ------------------------------------------------------------------

function cloneRole(r: SkeletonRole): SkeletonRole {
  return { ...r };
}
function cloneOrg(o: SkeletonOrg): SkeletonOrg {
  return { name: o.name, roles: o.roles.map(cloneRole) };
}

function pairRoles(li: SkeletonRole[], cv: SkeletonRole[]): Map<number, number> {
  const candidates: { i: number; j: number; score: number }[] = [];
  li.forEach((a, i) => cv.forEach((b, j) => {
    const score = roleAffinity(a, b);
    if (score > 0) candidates.push({ i, j, score });
  }));
  candidates.sort((x, y) => y.score - x.score || x.i - y.i || x.j - y.j);
  const usedCv = new Set<number>();
  const pairs = new Map<number, number>();
  for (const c of candidates) {
    if (pairs.has(c.i) || usedCv.has(c.j)) continue;
    pairs.set(c.i, c.j);
    usedCv.add(c.j);
  }
  return pairs;
}

function mergeRole(li: SkeletonRole, cv: SkeletonRole, org: string, out: SkeletonDisagreement[]): SkeletonRole {
  const push = (field: DisagreementField, l: string | null, c: string | null) =>
    out.push({ org, role: li.title, field, linkedin: l, cv: c });

  if (norm(li.title) !== norm(cv.title)) push("title", li.title, cv.title);
  if (li.start !== cv.start) push("start", li.start, cv.start);
  if (li.end !== cv.end) push("end", li.end, cv.end);
  if (li.location && cv.location && norm(li.location) !== norm(cv.location)) push("location", li.location, cv.location);

  const merged: SkeletonRole = { title: li.title, start: li.start, end: li.end };
  const location = li.location ?? cv.location;
  const blurb = cv.blurb ?? li.blurb;
  if (location !== undefined) merged.location = location;
  if (blurb !== undefined) merged.blurb = blurb;
  return merged;
}

/**
 * Merge two skeletons (ONBOARDING.md §3.2), stated rather than last-write-wins:
 * - LinkedIn wins on skeleton facts: org names, official titles, exact dates.
 * - The CV wins on bullet content (blurbs).
 * - Every place they disagree is reported - a date rounded to a year, a title upgraded
 *   in the retelling - never silently resolved.
 * Orgs match on normalised name (legal suffixes stripped, containment allowed); roles match
 * on overlapping dates or a fuzzy title. Unmatched roles/orgs from either side are kept,
 * LinkedIn order first. Pure: inputs are not mutated.
 */
export function mergeSkeletons(linkedin: Skeleton | null, cv: Skeleton | null): SkeletonMerge {
  if (!linkedin && !cv) return { merged: { orgs: [] }, disagreements: [] };
  if (!linkedin) return { merged: { orgs: cv!.orgs.map(cloneOrg) }, disagreements: [] };
  if (!cv) return { merged: { orgs: linkedin.orgs.map(cloneOrg) }, disagreements: [] };

  const disagreements: SkeletonDisagreement[] = [];
  const usedCvOrgs = new Set<number>();
  const orgs: SkeletonOrg[] = [];

  for (const liOrg of linkedin.orgs) {
    const j = cv.orgs.findIndex((o, idx) => !usedCvOrgs.has(idx) && sameOrg(liOrg.name, o.name));
    if (j === -1) {
      orgs.push(cloneOrg(liOrg));
      continue;
    }
    usedCvOrgs.add(j);
    const cvOrg = cv.orgs[j];
    if (norm(liOrg.name) !== norm(cvOrg.name)) {
      disagreements.push({ org: liOrg.name, role: null, field: "org", linkedin: liOrg.name, cv: cvOrg.name });
    }
    const pairs = pairRoles(liOrg.roles, cvOrg.roles);
    const roles: SkeletonRole[] = liOrg.roles.map((r, i) => {
      const jj = pairs.get(i);
      return jj === undefined ? cloneRole(r) : mergeRole(r, cvOrg.roles[jj], liOrg.name, disagreements);
    });
    const matchedCv = new Set(pairs.values());
    cvOrg.roles.forEach((r, jj) => {
      if (!matchedCv.has(jj)) roles.push(cloneRole(r));
    });
    orgs.push({ name: liOrg.name, roles });
  }

  cv.orgs.forEach((o, idx) => {
    if (!usedCvOrgs.has(idx)) orgs.push(cloneOrg(o));
  });

  return { merged: { orgs }, disagreements };
}
