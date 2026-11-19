/**
 * What the case library and the case room show about your attempts. Pure: the page
 * passes stored sessions (newest first or any order) and the current time.
 */

interface Timed {
  status: "running" | "done";
  turns: { at: string }[];
}

/**
 * Seconds on the case clock. Runs from the first turn while the case is live; once it is
 * done it stops at the last turn, so opening a finished case days later does not show a
 * clock of thousands of minutes.
 */
export function caseElapsedSeconds(s: Timed, now: number): number {
  const first = s.turns[0];
  if (!first) return 0;
  const end = s.status === "done" ? Date.parse(s.turns[s.turns.length - 1]!.at) : now;
  return Math.max(0, (end - Date.parse(first.at)) / 1000);
}

export interface CaseProgress {
  /** Best overall score of a finished attempt; null when none has been scored. */
  best: number | null;
  /** Finished, scored attempts. */
  finished: number;
  /** An attempt is still open. */
  running: boolean;
}

/** Per case id. A case you have never opened has no entry. */
export function caseProgress(
  sessions: { caseId: string; status: "running" | "done"; overall: number | null }[],
): Map<string, CaseProgress> {
  const out = new Map<string, CaseProgress>();
  for (const s of sessions) {
    const p = out.get(s.caseId) ?? { best: null, finished: 0, running: false };
    if (s.status === "running") p.running = true;
    else if (s.overall !== null) {
      p.finished += 1;
      p.best = p.best === null ? s.overall : Math.max(p.best, s.overall);
    }
    out.set(s.caseId, p);
  }
  return out;
}
