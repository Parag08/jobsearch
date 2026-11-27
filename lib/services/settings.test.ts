import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { envFor, loadCatalog, saveSettings, saveSettingsSection } from "./settings";
import { getUserSettings, putUserSettings } from "../repos/user-settings";
import { roleReadBatchFromEnv } from "../insights/settings";

const BASE = { AI_GATEWAY_API_KEY: "k", INTERVIEW_TURN_SILENCE_MS: "2500", INTERVIEW_TURN_UNFINISHED_MS: "6000", INTERVIEW_TURN_MIN_WORDS: "40", INTERVIEW_TURN_RAMBLE_WORDS: "280", INTERVIEW_TURN_QUIET_LEVEL: "0.05" };

describe("settings service", () => {
  it("saves valid values and the user's env reads them", async () => {
    const db = new FakeDb();
    expect(await saveSettings(db, "u1", { INTERVIEW_TURN_SILENCE_MS: "3000", HOME_GOAL_APPLY: "" }, BASE)).toEqual({ saved: true, errors: {} });
    expect((await envFor(db, "u1", BASE)).INTERVIEW_TURN_SILENCE_MS).toBe("3000");
    expect((await envFor(db, "u2", BASE)).INTERVIEW_TURN_SILENCE_MS).toBe("2500");
  });
  it("saves nothing when a value is wrong", async () => {
    const db = new FakeDb();
    const r = await saveSettings(db, "u1", { INTERVIEW_TURN_UNFINISHED_MS: "1000" }, BASE);
    expect(r.saved).toBe(false);
    expect(r.errors.INTERVIEW_TURN_UNFINISHED_MS).toBeTruthy();
    expect(db.rows("user_settings")).toHaveLength(0);
  });
  it("a row written around the form is checked again on read", async () => {
    const db = new FakeDb();
    await putUserSettings(db, "u1", { ROLE_READ_BATCH: "100000", AI_GATEWAY_INTERVIEWER_MODEL: "anthropic/some-pricey-model" });
    const env = await envFor(db, "u1", { ...BASE, ROLE_READ_BATCH: "10" });
    expect(env.ROLE_READ_BATCH).toBe("10");
    expect(roleReadBatchFromEnv(env)).toBe(10);
    expect(env.AI_GATEWAY_INTERVIEWER_MODEL).toBeUndefined();
  });
  it("updates only submitted keys in the section, and clears an override when inheritance is selected", async () => {
    const db = new FakeDb();
    await putUserSettings(db, "u1", { HOME_GOAL_APPLY: "4", PIPELINE_RECENT_DAYS: "14", ROLE_READ_BATCH: "3" });
    expect(await saveSettingsSection(db, "u1", "goals", { HOME_GOAL_APPLY: "", ROLE_READ_BATCH: "20" }, BASE))
      .toEqual({ saved: true, errors: {} });
    expect(await getUserSettings(db, "u1")).toEqual({ PIPELINE_RECENT_DAYS: "14", ROLE_READ_BATCH: "3" });
  });
  it("checks a section against overrides already saved outside it", async () => {
    const db = new FakeDb();
    await putUserSettings(db, "u1", { CV_MAX_BULLETS: "10" });
    const base = { ...BASE, CV_MAX_PER_ROLE: "3", CV_MIN_PER_ROLE: "2", CV_MAX_ORG_SHARE: "0.5", CV_COLLISION_OVERLAP: "0.5" };
    const result = await saveSettingsSection(db, "u1", "advanced", { CV_MIN_PER_ROLE: "4" }, base);
    expect(result.errors.CV_MIN_PER_ROLE).toContain("cannot exceed");
    expect(await getUserSettings(db, "u1")).toEqual({ CV_MAX_BULLETS: "10" });
  });
  it("does not lose another section's concurrent save, even without a settings row", async () => {
    const db = new FakeDb();
    const results = await Promise.all([
      saveSettingsSection(db, "u1", "goals", { HOME_GOAL_APPLY: "5" }, BASE),
      saveSettingsSection(db, "u1", "advanced", { ROLE_READ_BATCH: "8" }, BASE),
    ]);
    expect(results.every(({ saved }) => saved)).toBe(true);
    expect(await getUserSettings(db, "u1")).toEqual({ HOME_GOAL_APPLY: "5", ROLE_READ_BATCH: "8" });
  });
  it("validates the saved pause pair against the actual stored overrides after deployment defaults change", async () => {
    const db = new FakeDb();
    await putUserSettings(db, "u1", { INTERVIEW_TURN_UNFINISHED_MS: "2000" });
    expect((await envFor(db, "u1", BASE)).INTERVIEW_TURN_UNFINISHED_MS).toBe("6000");
    const result = await saveSettingsSection(db, "u1", "interview", { INTERVIEW_TURN_SILENCE_MS: "3000" }, BASE);
    expect(result.saved).toBe(false);
    expect(result.errors.INTERVIEW_TURN_UNFINISHED_MS).toContain("must be");
    expect(await getUserSettings(db, "u1")).toEqual({ INTERVIEW_TURN_UNFINISHED_MS: "2000" });

    expect(await saveSettingsSection(db, "u1", "interview", { INTERVIEW_TURN_SILENCE_MS: "1500" }, BASE))
      .toEqual({ saved: true, errors: {} });
    expect(await envFor(db, "u1", BASE)).toMatchObject({ INTERVIEW_TURN_SILENCE_MS: "1500", INTERVIEW_TURN_UNFINISHED_MS: "2000" });
  });
  it("rejects a shorter unfinished pause even with hands-free turn-taking disabled", async () => {
    const db = new FakeDb();
    const result = await saveSettingsSection(db, "u1", "interview", {
      INTERVIEW_TURN_SILENCE_MS: "2500", INTERVIEW_TURN_UNFINISHED_MS: "1000",
    }, {});
    expect(result.saved).toBe(false);
    expect(result.errors.INTERVIEW_TURN_UNFINISHED_MS).toContain("must be");
    expect(db.rows("user_settings")).toHaveLength(0);
  });
});

describe("loadCatalog", () => {
  const body = { data: [{ id: "a/b", name: "B", type: "language", pricing: { input: "0.000001", output: "0.000002" }, model_eligibility: { status: "eligible" } }] };
  it("asks with the key for this plan's eligibility", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify(body));
    }) as typeof globalThis.fetch;
    const c = await loadCatalog("k", fetch);
    expect(calls[0].url).toContain("include_availability");
    expect(calls[0].auth).toBe("Bearer k");
    expect(c).toEqual({ models: [{ id: "a/b", name: "B", inputPerM: 1, outputPerM: 2, eligible: true, reasoning: false }], eligibilityKnown: true });
  });
  it("falls back to the public list (eligibility unknown) when the keyed call fails", async () => {
    let n = 0;
    const fetch = (async () => (n++ === 0 ? new Response("slow down", { status: 429 }) : new Response(JSON.stringify(body)))) as typeof globalThis.fetch;
    const c = await loadCatalog("k", fetch);
    expect(c.eligibilityKnown).toBe(false);
    expect(c.models).toHaveLength(1);
  });
});
