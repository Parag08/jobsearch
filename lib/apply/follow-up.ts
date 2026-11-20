import { shortDate } from "../pipeline-display";

/**
 * The next step set when an application is marked applied (docs/APPLY-FLOW.md step 5): follow
 * up if there is no reply after APPLY_FOLLOW_UP_DAYS (.env.example). Unset means none is set.
 */
export function applyFollowUpDaysFromEnv(env: Record<string, string | undefined>): number | undefined {
  const raw = env.APPLY_FOLLOW_UP_DAYS;
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`APPLY_FOLLOW_UP_DAYS must be a whole number >= 1, got "${raw}"`);
  return n;
}

export function followUpAfterApplying(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `Follow up if no reply by ${shortDate(d.toISOString().slice(0, 10), today)}`;
}
