/**
 * When is the candidate's turn over? Hands-free voice answers end on silence, and a fixed
 * 2.5s silence both cut people off mid-thought (20 Nov: "...I was working at nutanix as",
 * then the mock ended) and made every reply slow. Rules only:
 * - an answer that stops on a connective, article or preposition, or a comma, or is still
 *   short, gets the long wait (`unfinishedMs`);
 * - a finished-sounding answer gets the short one (`silenceMs`);
 * - the timer is only trusted when the microphone is quiet too (`quietLevel`, checked in the
 *   room), since recognition can go silent while the candidate is still talking;
 * - past `rambleWords`, the interviewer cuts in at the next finished phrase, as a real one does.
 * Every value comes from env (INTERVIEW_TURN_*); unset means hands-free waits for the button.
 */

export interface TurnSettings {
  silenceMs: number;
  unfinishedMs: number;
  minWords: number;
  rambleWords: number;
  /** Microphone loudness (0-1, as the mic meter reports it) below which the candidate is quiet. */
  quietLevel: number;
}

export function turnSettingsFromEnv(env: Record<string, string | undefined>): TurnSettings | null {
  const names = {
    silenceMs: "INTERVIEW_TURN_SILENCE_MS",
    unfinishedMs: "INTERVIEW_TURN_UNFINISHED_MS",
    minWords: "INTERVIEW_TURN_MIN_WORDS",
    rambleWords: "INTERVIEW_TURN_RAMBLE_WORDS",
    quietLevel: "INTERVIEW_TURN_QUIET_LEVEL",
  } as const;
  const raw = Object.fromEntries(Object.entries(names).map(([k, n]) => [k, env[n]?.trim()])) as Record<keyof TurnSettings, string | undefined>;
  if (Object.values(raw).some((v) => !v)) return null;
  validateTurnPauses(env);
  const int = (k: keyof TurnSettings) => {
    const n = Number(raw[k]);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${names[k]} must be a whole number above 0, got "${raw[k]}"`);
    return n;
  };
  const out: TurnSettings = {
    silenceMs: int("silenceMs"),
    unfinishedMs: int("unfinishedMs"),
    minWords: int("minWords"),
    rambleWords: int("rambleWords"),
    quietLevel: Number(raw.quietLevel),
  };
  if (!(out.quietLevel > 0 && out.quietLevel < 1)) throw new Error(`${names.quietLevel} must be between 0 and 1, got "${raw.quietLevel}"`);
  return out;
}

export function validateTurnPauses(env: Record<string, string | undefined>): void {
  const finished = env.INTERVIEW_TURN_SILENCE_MS?.trim();
  const unfinished = env.INTERVIEW_TURN_UNFINISHED_MS?.trim();
  if (finished && unfinished && Number(unfinished) < Number(finished)) {
    throw new Error("INTERVIEW_TURN_UNFINISHED_MS must be at least INTERVIEW_TURN_SILENCE_MS");
  }
}

/** Words that never end a finished sentence. */
const DANGLING = new Set(
  (
    "a an the and or but so because as at in on of to for with from by into about than then that which who where when while if " +
    "i we my our was were is are be been had has have would could will can like um uh er just very really"
  ).split(" "),
);

const wordsOf = (text: string) => text.trim().split(/\s+/).filter(Boolean);

/** True when the answer, as transcribed so far, stops mid-sentence. */
export function soundsUnfinished(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/[,;:\-–—]$/.test(t)) return true;
  const last = wordsOf(t).at(-1)!.toLowerCase().replace(/[^a-z']/g, "");
  return DANGLING.has(last);
}

/** How long a silence ends this answer. */
export function endOfTurnMs(text: string, s: TurnSettings): number {
  return soundsUnfinished(text) || wordsOf(text).length < s.minWords ? s.unfinishedMs : s.silenceMs;
}

/** The answer has run long and just reached a finished phrase: a real interviewer would cut in. */
export function shouldCutIn(text: string, s: TurnSettings): boolean {
  return wordsOf(text).length >= s.rambleWords && !soundsUnfinished(text);
}
