/**
 * CV readiness (ONBOARDING.md §1, §3.4): progress shown as "good enough yet?", not
 * "questions remaining". Minimum viable bank = identity + education + 2-3 recent roles
 * + ~3 points each + one target ≈ 10 points.
 */

export interface ReadinessRole {
  points: number;
  recent: boolean;
}

export interface ReadinessInput {
  identity: boolean;
  education: boolean;
  roles: ReadinessRole[];
  targets: number;
}

export interface Readiness {
  /** 0-100, integer. */
  score: number;
  /** What still blocks a credible one-pager, in the order it should be asked. */
  missing: string[];
}

export const MIN_RECENT_ROLES = 2;
export const POINTS_PER_ROLE = 3;
/** Three recent roles at three points each; the ≈10 of the spec. */
export const TARGET_POINTS = 9;

// Weights sum to 100. A target outweighs education: nothing renders without one.
const W_IDENTITY = 15;
const W_EDUCATION = 10;
const W_TARGET = 15;
const W_ROLES = 20;
const W_POINTS = 40;

export function readiness(input: ReadinessInput): Readiness {
  const missing: string[] = [];
  let score = 0;

  if (input.identity) score += W_IDENTITY;
  else missing.push("identity");

  if (input.education) score += W_EDUCATION;
  else missing.push("education");

  if (input.targets > 0) score += W_TARGET;
  else missing.push("target");

  const recent = input.roles.filter((r) => r.recent);
  const roleCount = Math.min(recent.length, MIN_RECENT_ROLES);
  score += (W_ROLES * roleCount) / MIN_RECENT_ROLES;
  if (recent.length < MIN_RECENT_ROLES) missing.push(`recent roles (${recent.length} of ${MIN_RECENT_ROLES})`);

  recent.forEach((r, i) => {
    if (r.points < POINTS_PER_ROLE) missing.push(`recent role ${i + 1} needs ${POINTS_PER_ROLE - r.points} more points`);
  });

  const points = recent.reduce((sum, r) => sum + Math.max(0, r.points), 0);
  const counted = Math.min(points, TARGET_POINTS);
  score += (W_POINTS * counted) / TARGET_POINTS;
  if (points < TARGET_POINTS) missing.push(`points (${points} of ${TARGET_POINTS})`);

  return { score: Math.min(100, Math.round(score)), missing };
}

export const TOP_STRENGTH = 5;
/** Matches the DB default (supabase/schema.sql: strength int not null default 3). */
export const DEFAULT_STRENGTH = 3;
export const MAX_PROUDEST = 3;

/**
 * Screen 5 - pick your proudest three. The chosen get top strength, everyone else keeps
 * the default; this is the tie-break signal the ranker needs. Fewer than three is fine.
 */
export function proudestThree(bulletIds: string[], chosen: string[]): Record<string, number> {
  const picked = Array.from(new Set(chosen));
  if (picked.length > MAX_PROUDEST) {
    throw new RangeError(`proudestThree: at most ${MAX_PROUDEST} bullets may be chosen, got ${picked.length}`);
  }
  const known = new Set(bulletIds);
  for (const id of picked) {
    if (!known.has(id)) throw new Error(`proudestThree: unknown bullet id "${id}"`);
  }
  const top = new Set(picked);
  const out: Record<string, number> = {};
  for (const id of bulletIds) out[id] = top.has(id) ? TOP_STRENGTH : DEFAULT_STRENGTH;
  return out;
}
