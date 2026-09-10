import { scoreJob } from "../scoring";
import { norm, type Contact, type SectorNode, type SourcedJob } from "../types";
import type { WatchlistEntry } from "./types";

/**
 * Declared-target boost. DESIGN.md section 4, break #3: "A declared target
 * must outrank an incidentally observed one" and a role at a target company
 * should surface even when its title matches the bullet bank poorly. In
 * lib/scoring.ts title overlap is worth at most 30 and geography 10, so 45
 * guarantees a target job with zero title overlap beats any non-target job
 * that has neither sector-company nor network signal - without touching the
 * base weights.
 */
export const W_DECLARED_TARGET = 45;

export interface ScoringContext {
  node: SectorNode;
  evidencedSkills: string[];
  contacts: Contact[];
  watchlist: WatchlistEntry[];
}

/** Base score from lib/scoring.ts plus the declared-target boost, clamped 0-100. */
export function scoreSourcedJob(job: SourcedJob, ctx: ScoringContext): number {
  const base = scoreJob(job, ctx.node, ctx.evidencedSkills, ctx.contacts);
  const targets = new Set(ctx.watchlist.filter((w) => w.active).map((w) => norm(w.company)));
  const boost = targets.has(norm(job.company)) ? W_DECLARED_TARGET : 0;
  return Math.max(0, Math.min(100, Math.round(base + boost)));
}
