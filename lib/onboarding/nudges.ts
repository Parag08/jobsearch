import { POINTS_PER_ROLE } from "./readiness";

/**
 * The nudge queue (ONBOARDING.md §4): a first-class feature, not a leftover. Everything
 * onboarding deliberately deferred, ordered by what unblocks the most.
 */

export type NudgeKind =
  | "missing-target"
  | "missing-work-authorisation"
  | "missing-languages"
  | "thin-role"
  | "needs-metric"
  | "missing-summary";

export interface Nudge {
  kind: NudgeKind;
  /** The role or bullet id the nudge points at; null for bank-level nudges. */
  ref: string | null;
  /** Lower runs first. */
  priority: number;
}

export interface NudgeBank {
  targets: number;
  /** True when the user has answered the sponsorship question. */
  workAuthorisation: boolean;
  /** True when languages have been captured. */
  languages: boolean;
  /** True when an About / summary line exists. */
  summary: boolean;
  roles: { id: string; points: number; recent: boolean }[];
  /** The explicit "needs a metric" state per bullet (guard 2) - never inferred here. */
  bullets: { id: string; needsMetric: boolean }[];
}

/**
 * Priority bands. A target first (nothing renders without one), then the two hard filters
 * a CV parse never surfaces, then depth on recent roles, then metrics, then older roles,
 * then the summary line.
 */
export const NUDGE_PRIORITY = {
  "missing-target": 10,
  "missing-work-authorisation": 20,
  "missing-languages": 30,
  "thin-role-recent": 40,
  "needs-metric": 50,
  "thin-role-older": 60,
  "missing-summary": 70,
} as const;

export function nudgeQueue(bank: NudgeBank): Nudge[] {
  const out: Nudge[] = [];
  if (bank.targets <= 0) out.push({ kind: "missing-target", ref: null, priority: NUDGE_PRIORITY["missing-target"] });
  if (!bank.workAuthorisation) {
    out.push({ kind: "missing-work-authorisation", ref: null, priority: NUDGE_PRIORITY["missing-work-authorisation"] });
  }
  if (!bank.languages) out.push({ kind: "missing-languages", ref: null, priority: NUDGE_PRIORITY["missing-languages"] });

  for (const r of bank.roles) {
    if (r.points >= POINTS_PER_ROLE) continue;
    out.push({
      kind: "thin-role",
      ref: r.id,
      priority: r.recent ? NUDGE_PRIORITY["thin-role-recent"] : NUDGE_PRIORITY["thin-role-older"],
    });
  }
  for (const b of bank.bullets) {
    if (b.needsMetric) out.push({ kind: "needs-metric", ref: b.id, priority: NUDGE_PRIORITY["needs-metric"] });
  }
  if (!bank.summary) out.push({ kind: "missing-summary", ref: null, priority: NUDGE_PRIORITY["missing-summary"] });

  // Array.prototype.sort is stable: equal priorities keep input order.
  return out.sort((a, b) => a.priority - b.priority);
}
