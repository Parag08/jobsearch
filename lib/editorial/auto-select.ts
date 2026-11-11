import type { Pin, Selection, SelectionDecision } from "./select";

/**
 * Whole-pool selection: the shortlist the findparagjob CV builder makes
 * (tools/cv-builder/lib/score.js autoSelect), plus the balance rules Parag set in
 * its docs/cv-writing.md §2, written generically:
 *
 *   floor        every role keeps its best bullet - a role with nothing under it reads
 *                as an omission
 *   fill         then best score first, up to a bullet budget
 *   role limit   at most N bullets from one role, so one strong job cannot swallow the page
 *   org cap      per-org caps from profile data (CLAUDE.md rule 3)
 *   share        no org takes more than a share of the bullet lines (counting all its roles)
 *   competency   one example per competency first: a bullet whose tags say it tells the same
 *                story as one already chosen (rarity-weighted overlap, overlap.js) waits, and
 *                is used only when nothing distinct is left
 *
 * Every limit is a parameter from config (lib/cv-page-settings.ts), never a constant here.
 * Pure - no I/O.
 */

export interface PoolBullet {
  id: string;
  /** The role it sits under (a project). */
  projectId: string;
  /** The organisation, for org caps and share (an org can hold several roles). */
  orgId: string;
  score: number;
  /** Taxonomy tags, for the competency check. */
  skills: string[];
  /** Lines it takes on the page (measured by the caller). */
  lines: number;
}

export interface AutoSelectLimits {
  maxBullets: number;
  maxPerRole: number;
  minPerRole: number;
  /** 0..1: the most of the bullet lines any one org may take. Floors and pins can exceed it. */
  maxOrgShare: number;
  /** 0..1: rarity-weighted tag overlap at or above which two bullets tell the same story. */
  collisionOverlap: number;
}

export interface AutoSelectOptions {
  pins?: Pin[];
  /** org -> max bullets. Data, never a hardcoded org. */
  orgCaps?: Record<string, number>;
  excludes?: string[];
}

/** Rarity-weighted Jaccard of two tag sets: a tag carried by few bullets dominates. */
export function tagCollision(a: string[], b: string[], freq: Map<string, number>): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  const w = (t: string) => 1 / Math.max(1, freq.get(t) ?? 1);
  let shared = 0;
  let union = 0;
  for (const t of new Set([...A, ...B])) {
    union += w(t);
    if (A.has(t) && B.has(t)) shared += w(t);
  }
  return union ? shared / union : 0;
}

export function autoSelect(pool: PoolBullet[], limits: AutoSelectLimits, opts: AutoSelectOptions = {}): Selection {
  const ranked = [...pool].sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
  const byId = new Map(pool.map((p) => [p.id, p]));
  const excludes = new Set(opts.excludes ?? []);
  const orgCaps = opts.orgCaps ?? {};
  const freq = new Map<string, number>();
  for (const p of pool) for (const t of p.skills) freq.set(t, (freq.get(t) ?? 0) + 1);

  const chosen: string[] = [];
  const decisions = new Map<string, SelectionDecision>();
  const decide = (p: PoolBullet, included: boolean, kind: SelectionDecision["kind"], reason: string) =>
    decisions.set(p.id, { bulletId: p.id, included, kind, reason, score: p.score, orgId: p.orgId });

  const count = (key: "projectId" | "orgId", value: string) => chosen.filter((id) => byId.get(id)![key] === value).length;
  const lines = (ids: string[]) => ids.reduce((sum, id) => sum + byId.get(id)!.lines, 0);
  const orgLines = (org: string) => lines(chosen.filter((id) => byId.get(id)!.orgId === org));
  const collidesWith = (p: PoolBullet) =>
    chosen.find((id) => tagCollision(p.skills, byId.get(id)!.skills, freq) >= limits.collisionOverlap);

  // 1. pins: in first, never trimmed.
  const pinned: string[] = [];
  for (const pin of opts.pins ?? []) {
    const p = byId.get(pin.bulletId);
    if (!p || pinned.includes(p.id)) continue;
    pinned.push(p.id);
    chosen.push(p.id);
    decide(p, true, "pinned", pin.reason);
  }
  for (const p of ranked) if (excludes.has(p.id) && !decisions.has(p.id)) decide(p, false, "excluded", "excluded for this application");

  const open = () => ranked.filter((p) => !decisions.has(p.id));
  const capReached = (p: PoolBullet) => orgCaps[p.orgId] !== undefined && count("orgId", p.orgId) >= orgCaps[p.orgId]!;

  // 2. floor: every role keeps its best bullets.
  for (const role of [...new Set(ranked.map((p) => p.projectId))]) {
    for (const p of open().filter((x) => x.projectId === role)) {
      if (count("projectId", role) >= limits.minPerRole || capReached(p)) break;
      chosen.push(p.id);
      decide(p, true, "floor", `keeps ${p.projectId} on the page (score ${p.score})`);
    }
  }

  // 3. fill by score, then judge each org's share on the finished page: trim the over-share
  //    org's weakest droppable bullet, mark the org saturated, refill, repeat. A same-story
  //    bullet is deferred, and used only when nothing distinct is left.
  const saturated = new Set<string>();
  const shareOf = (org: string, extra = 0) => (orgLines(org) + extra) / (lines(chosen) + extra);
  const tryAdd = (p: PoolBullet, allowCollision: boolean): boolean => {
    if (chosen.length >= limits.maxBullets) return decide(p, false, "budget", `below the line (score ${p.score})`), false;
    if (count("projectId", p.projectId) >= limits.maxPerRole) {
      return decide(p, false, "role-limit", `${p.projectId} already has ${limits.maxPerRole}`), false;
    }
    if (capReached(p)) return decide(p, false, "capped", `over the ${p.orgId} cap of ${orgCaps[p.orgId]}`), false;
    if (saturated.has(p.orgId) && shareOf(p.orgId, p.lines) > limits.maxOrgShare) {
      return decide(p, false, "share", `${p.orgId} would take ${Math.round(shareOf(p.orgId, p.lines) * 100)}% of the lines`), false;
    }
    const same = collidesWith(p);
    if (same && !allowCollision) return decide(p, false, "collision", `same story as ${same}`), false;
    chosen.push(p.id);
    decide(p, true, "scored", same ? `score ${p.score}; overlaps ${same}, nothing distinct left` : `score ${p.score}`);
    return true;
  };
  const notIn = () => ranked.filter((p) => !chosen.includes(p.id) && !pinned.includes(p.id) && !excludes.has(p.id));
  const fill = () => {
    for (const p of notIn()) tryAdd(p, false);
    for (const p of notIn().filter((x) => decisions.get(x.id)?.kind === "collision")) {
      if (chosen.length < limits.maxBullets) tryAdd(p, true);
    }
  };
  fill();
  for (let guard = 0; guard < pool.length; guard++) {
    const over = [...new Set(chosen.map((id) => byId.get(id)!.orgId))].find((org) => shareOf(org) > limits.maxOrgShare);
    if (!over) break;
    saturated.add(over);
    const droppable = chosen
      .map((id) => byId.get(id)!)
      .filter((p) => p.orgId === over && !pinned.includes(p.id) && count("projectId", p.projectId) > limits.minPerRole)
      .sort((x, y) => x.score - y.score || y.id.localeCompare(x.id));
    const weakest = droppable[0];
    if (!weakest) break; // only floors and pins left: they may exceed the share
    chosen.splice(chosen.indexOf(weakest.id), 1);
    decide(weakest, false, "share", `${over} over ${Math.round(limits.maxOrgShare * 100)}% of the lines; its weakest bullet`);
    fill();
  }

  const included = ranked.filter((p) => chosen.includes(p.id)).map((p) => p.id);
  return {
    bulletIds: [...pinned, ...included.filter((id) => !pinned.includes(id))],
    pinnedIds: pinned,
    decisions: ranked.map((p) => decisions.get(p.id)!),
  };
}
