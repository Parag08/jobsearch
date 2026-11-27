import { describe, it, expect } from "vitest";
import { SETTINGS, settingsEnv, validateSettings, cleanValues, allowedModels } from "./registry";

const ENV = {
  AI_GATEWAY_API_KEY: "secret",
  AI_GATEWAY_PREMIUM_MODEL: "mistral/mistral-medium-3.5",
  INTERVIEW_TURN_SILENCE_MS: "2500",
  INTERVIEW_TURN_UNFINISHED_MS: "6000",
  INTERVIEW_TURN_MIN_WORDS: "40",
  INTERVIEW_TURN_RAMBLE_WORDS: "280",
  INTERVIEW_TURN_QUIET_LEVEL: "0.05",
};

describe("the settings registry", () => {
  it("never offers a secret or a deployment-wide key", () => {
    const keys = SETTINGS.map((s) => s.key);
    for (const k of keys) expect(k).not.toMatch(/KEY|SECRET|SUPABASE|DEMO_|TOKEN$|GTM|CLIENT_ID|BUCKET|DIR$/);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("covers the interviewer model and the turn-taking waits", () => {
    const keys = SETTINGS.map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(["AI_GATEWAY_INTERVIEWER_MODEL", "INTERVIEW_TURN_SILENCE_MS", "HOME_GOAL_APPLY", "CV_MAX_BULLETS"]));
  });
});

describe("settingsEnv", () => {
  it("lays the user's values over the deployment env, for registered keys only", () => {
    const env = settingsEnv(ENV, { INTERVIEW_TURN_SILENCE_MS: "3000", AI_GATEWAY_API_KEY: "stolen", NOT_A_SETTING: "x" });
    expect(env.INTERVIEW_TURN_SILENCE_MS).toBe("3000");
    expect(env.AI_GATEWAY_API_KEY).toBe("secret");
    expect(env.NOT_A_SETTING).toBeUndefined();
    expect(env.INTERVIEW_TURN_MIN_WORDS).toBe("40");
  });
  it("re-checks stored values on read: an out-of-range value falls back to the deployment's", () => {
    const env = settingsEnv({ ...ENV, ROLE_READ_BATCH: "10" }, { ROLE_READ_BATCH: "100000", INTERVIEW_FULL_MAX_TOPICS: "99999", HOME_GOAL_APPLY: "5" });
    expect(env.ROLE_READ_BATCH).toBe("10");
    expect(env.INTERVIEW_FULL_MAX_TOPICS).toBeUndefined();
    expect(env.HOME_GOAL_APPLY).toBe("5");
  });
  it("drops a token cap above the registry's maximum, and the effort that needs it", () => {
    const env = settingsEnv(ENV, {
      AI_GATEWAY_INTERVIEWER_MODEL: "google/gemini-3.8-flash",
      AI_GATEWAY_INTERVIEWER_EFFORT: "max",
      AI_GATEWAY_INTERVIEWER_MAX_TOKENS: "1000000",
    });
    expect(env.AI_GATEWAY_INTERVIEWER_MAX_TOKENS).toBeUndefined();
    expect(env.AI_GATEWAY_INTERVIEWER_EFFORT).toBeUndefined();
    expect(env.AI_GATEWAY_INTERVIEWER_MODEL).toBeUndefined();
  });
  it("drops a model the deployment does not allow", () => {
    const env = settingsEnv(ENV, { AI_GATEWAY_INTERVIEWER_MODEL: "anthropic/some-pricey-model", AI_GATEWAY_SMALL_MODEL: "google/gemini-2.5-flash-lite" });
    expect(env.AI_GATEWAY_INTERVIEWER_MODEL).toBeUndefined();
    expect(env.AI_GATEWAY_SMALL_MODEL).toBe("google/gemini-2.5-flash-lite");
  });
  it("drops a group the app's own readers reject, keeping the deployment's values", () => {
    const env = settingsEnv(ENV, { INTERVIEW_TURN_UNFINISHED_MS: "1000", HOME_GOAL_APPLY: "5" });
    expect(env.INTERVIEW_TURN_UNFINISHED_MS).toBe("6000");
    expect(env.HOME_GOAL_APPLY).toBe("5");
  });
});

describe("allowedModels", () => {
  it("defaults to the preference lists, plus the deployment's own models", () => {
    const allowed = allowedModels(ENV);
    expect(allowed.has("google/gemini-3.8-flash")).toBe(true);
    expect(allowed.has("mistral/mistral-medium-3.5")).toBe(true);
    expect(allowed.has("anthropic/some-pricey-model")).toBe(false);
  });
  it("AI_GATEWAY_ALLOWED_MODELS replaces the preference lists", () => {
    const allowed = allowedModels({ ...ENV, AI_GATEWAY_ALLOWED_MODELS: "google/gemini-3.8-flash, openai/gpt-6-luna" });
    expect(allowed.has("openai/gpt-6-luna")).toBe(true);
    expect(allowed.has("anthropic/claude-opus-5.5")).toBe(false);
    expect(allowed.has("mistral/mistral-medium-3.5")).toBe(true);
    for (const empty of ["", " , "]) {
      const only = allowedModels({ ...ENV, AI_GATEWAY_ALLOWED_MODELS: empty });
      expect(only.has("anthropic/claude-opus-5.5")).toBe(false);
      expect(only.has("mistral/mistral-medium-3.5")).toBe(true);
    }
    expect(validateSettings({ ...ENV, AI_GATEWAY_ALLOWED_MODELS: "google/gemini-3.8-flash" }, { AI_GATEWAY_INTERVIEWER_MODEL: "anthropic/claude-opus-5.5" }).AI_GATEWAY_INTERVIEWER_MODEL).toBeTruthy();
  });
});

describe("cleanValues", () => {
  it("drops blanks (back to the default), unknown keys and secrets, and trims", () => {
    expect(cleanValues({ INTERVIEW_TURN_SILENCE_MS: " 3000 ", HOME_GOAL_APPLY: "", AI_GATEWAY_API_KEY: "x", WHATEVER: "1" })).toEqual({
      INTERVIEW_TURN_SILENCE_MS: "3000",
    });
  });
});

describe("validateSettings", () => {
  it("accepts good values", () => {
    expect(validateSettings(ENV, { INTERVIEW_TURN_SILENCE_MS: "3000", AI_GATEWAY_INTERVIEWER_MODEL: "anthropic/claude-opus-5.5" })).toEqual({});
  });
  it("rejects a field that is the wrong kind, with the field named", () => {
    const errors = validateSettings(ENV, { INTERVIEW_TURN_SILENCE_MS: "soon", AI_GATEWAY_INTERVIEWER_MODEL: "opus", INTERVIEW_TURN_QUIET_LEVEL: "3" });
    expect(Object.keys(errors).sort()).toEqual(["AI_GATEWAY_INTERVIEWER_MODEL", "INTERVIEW_TURN_QUIET_LEVEL", "INTERVIEW_TURN_SILENCE_MS"]);
  });
  it("runs the app's own rules on the combination (the long wait must be at least the short one)", () => {
    const errors = validateSettings(ENV, { INTERVIEW_TURN_UNFINISHED_MS: "1000" });
    expect(errors.INTERVIEW_TURN_UNFINISHED_MS).toMatch(/at least/);
    // In the page's words, not env names.
    expect(errors.INTERVIEW_TURN_UNFINISHED_MS).toContain("Pause after an unfinished answer");
    expect(errors.INTERVIEW_TURN_UNFINISHED_MS).not.toMatch(/INTERVIEW_TURN_/);
  });
  it("an effort without a token cap is caught", () => {
    const errors = validateSettings(ENV, { AI_GATEWAY_INTERVIEWER_MODEL: "anthropic/claude-opus-5.5", AI_GATEWAY_INTERVIEWER_EFFORT: "low" });
    expect(errors.AI_GATEWAY_INTERVIEWER_MAX_TOKENS ?? errors.AI_GATEWAY_INTERVIEWER_EFFORT).toBeTruthy();
  });
});

describe("blank", () => {
  it("every model field says what a blank means", () => {
    for (const s of SETTINGS.filter((x) => x.kind.type === "model")) expect(s.blank).toBeTruthy();
  });
});
