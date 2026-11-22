import { describe, it, expect } from "vitest";
import { parseCatalog, modelChoices, interviewCost } from "./models";

const RAW = {
  data: [
    { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", type: "language", tags: ["reasoning", "tool-use"], pricing: { input: "0.000004", output: "0.00002" }, model_eligibility: { status: "restricted" } },
    { id: "anthropic/claude-opus-5.5-batch", name: "Batch", type: "language", pricing: { input: "0.000002", output: "0.00001" } },
    { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", type: "language", pricing: { input: "0.00000075", output: "0.00000375" }, model_eligibility: { status: "eligible" } },
    { id: "mistral/mistral-medium-3.5", name: "Mistral Medium 3.5", type: "language", pricing: { input: "0.0000015", output: "0.0000075" }, model_eligibility: { status: "eligible" } },
    { id: "openai/text-embedding-9", name: "Embed", type: "embedding", pricing: { input: "0.0000001" } },
    { id: "zai/glm-5.3", name: "GLM 5.3", type: "language", pricing: { input: "0.0000014", output: "0.0000044" }, model_eligibility: { status: "eligible" } },
  ],
};

describe("parseCatalog", () => {
  it("keeps language models (no batch variants) with prices per million tokens and plan eligibility", () => {
    const c = parseCatalog(RAW);
    expect(c.map((m) => m.id)).toEqual(["anthropic/claude-opus-5.5", "google/gemini-3.8-flash", "mistral/mistral-medium-3.5", "zai/glm-5.3"]);
    expect(c[0]).toEqual({ id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", inputPerM: 4, outputPerM: 20, eligible: false, reasoning: true });
    expect(c[1].reasoning).toBe(false);
    expect(c[1].eligible).toBe(true);
  });
  it("eligibility is unknown when the gateway did not say", () => {
    expect(parseCatalog({ data: [{ id: "a/b", name: "B", type: "language", pricing: { input: "0.000001", output: "0.000002" } }] })[0].eligible).toBeNull();
  });
  it("survives junk", () => {
    expect(parseCatalog(null)).toEqual([]);
    expect(parseCatalog({ data: [{ id: 3 }] })).toEqual([]);
  });
});

describe("modelChoices", () => {
  const prefs = ["anthropic/claude-opus-5.5", "google/gemini-3.8-flash", "mistral/mistral-medium-3.5"];
  it("ranks the job's preferred models first and recommends the first one the plan allows", () => {
    const { ranked, recommended } = modelChoices(parseCatalog(RAW), prefs);
    expect(ranked.map((m) => m.id)).toEqual(prefs);
    expect(recommended).toBe("google/gemini-3.8-flash");
  });
  it("lists the other models the plan allows after the ranked ones", () => {
    expect(modelChoices(parseCatalog(RAW), prefs).others.map((m) => m.id)).toEqual(["zai/glm-5.3"]);
  });
  it("with eligibility unknown, recommends the top preference", () => {
    const unknown = parseCatalog({ data: RAW.data.map(({ model_eligibility: _, ...m }) => m) });
    expect(modelChoices(unknown, prefs).recommended).toBe("anthropic/claude-opus-5.5");
  });
});

describe("interviewCost", () => {
  it("estimates a full interview from the model's prices", () => {
    // 20 turns x (2,000 in, 600 out) at $4 / $20 per M = 20 x (0.008 + 0.012) = $0.40
    expect(interviewCost({ inputPerM: 4, outputPerM: 20 })).toBeCloseTo(0.4, 5);
  });
});
