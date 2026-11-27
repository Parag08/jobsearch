import { describe, it, expect } from "vitest";
import { endOfTurnMs, shouldCutIn, turnSettingsFromEnv, type TurnSettings } from "./turn-taking";

const env = {
  INTERVIEW_TURN_SILENCE_MS: "1500",
  INTERVIEW_TURN_UNFINISHED_MS: "4500",
  INTERVIEW_TURN_MIN_WORDS: "40",
  INTERVIEW_TURN_RAMBLE_WORDS: "260",
  INTERVIEW_TURN_QUIET_LEVEL: "0.04",
};
const settings = turnSettingsFromEnv(env) as TurnSettings;

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("turnSettingsFromEnv", () => {
  it("reads every setting", () => {
    expect(settings).toEqual({ silenceMs: 1500, unfinishedMs: 4500, minWords: 40, rambleWords: 260, quietLevel: 0.04 });
  });
  it("is off (null) when any setting is missing, so hands-free waits for the button", () => {
    const { INTERVIEW_TURN_MIN_WORDS: _, ...rest } = env;
    expect(turnSettingsFromEnv(rest)).toBeNull();
  });
  it("stays off when an incomplete deployment also has reversed pauses", () => {
    const { INTERVIEW_TURN_MIN_WORDS: _, ...rest } = env;
    expect(turnSettingsFromEnv({ ...rest, INTERVIEW_TURN_UNFINISHED_MS: "1000" })).toBeNull();
  });
  it("refuses nonsense", () => {
    expect(() => turnSettingsFromEnv({ ...env, INTERVIEW_TURN_SILENCE_MS: "soon" })).toThrow(/INTERVIEW_TURN_SILENCE_MS/);
    expect(() => turnSettingsFromEnv({ ...env, INTERVIEW_TURN_UNFINISHED_MS: "1000" })).toThrow(/UNFINISHED/);
    expect(() => turnSettingsFromEnv({ ...env, INTERVIEW_TURN_QUIET_LEVEL: "2" })).toThrow(/QUIET/);
  });
});

describe("endOfTurnMs", () => {
  // The 20 Nov 12:09 cut-off: ~30 words, stopping on "as".
  const CUT = "So I started my career as a backend engineer and then I moved into storage and after a few years I was working at nutanix as";

  it("waits longer for an answer that stops mid-sentence (the 20 Nov cut-off)", () => {
    expect(endOfTurnMs(CUT, settings)).toBe(4500);
    expect(endOfTurnMs(`${words(80)} and the`, settings)).toBe(4500);
    expect(endOfTurnMs(`${words(80)} because,`, settings)).toBe(4500);
  });

  it("waits longer while the answer is still short", () => {
    expect(endOfTurnMs("I led the migration end to end.", settings)).toBe(4500);
  });

  it("ends quickly after a full, finished answer", () => {
    expect(endOfTurnMs(`${words(80)} and that is why it worked.`, settings)).toBe(1500);
    expect(endOfTurnMs(`${words(80)} so we shipped it`, settings)).toBe(1500);
  });
});

describe("shouldCutIn", () => {
  it("cuts in on a ramble, at a finished phrase", () => {
    expect(shouldCutIn(`${words(300)} and it shipped`, settings)).toBe(true);
  });
  it("never cuts in mid-phrase or on a normal answer", () => {
    expect(shouldCutIn(`${words(300)} and then the`, settings)).toBe(false);
    expect(shouldCutIn(words(120), settings)).toBe(false);
  });
});
