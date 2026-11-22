import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { envFor, loadCatalog, saveSettings } from "./settings";

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
