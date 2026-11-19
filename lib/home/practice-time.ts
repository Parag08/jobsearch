/**
 * How long practice took, for the totals on the dashboard. A mock interview records its
 * own length; an older one without it is estimated from what was said. A case is the time
 * between its turns, each gap capped, so a case left open overnight is not hours of work.
 */

/** A steady speaking pace, words per minute. */
export const SPEAKING_WPM = 130;
/** A pause between case turns counts for at most this long. */
export const CASE_IDLE_CAP_SECONDS = 600;

export function attemptSeconds(a: { durationSeconds: number | null; transcript: string }): number {
  if (a.durationSeconds !== null) return Math.round(a.durationSeconds);
  const words = a.transcript.split(/\s+/).filter(Boolean).length;
  return Math.round((words / SPEAKING_WPM) * 60);
}

/** Turn timestamps (ISO), in order. */
export function caseSeconds(turnTimes: string[]): number {
  let total = 0;
  for (let i = 1; i < turnTimes.length; i++) {
    const gap = (Date.parse(turnTimes[i]!) - Date.parse(turnTimes[i - 1]!)) / 1000;
    if (gap > 0) total += Math.min(gap, CASE_IDLE_CAP_SECONDS);
  }
  return Math.round(total);
}
