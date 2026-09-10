import { describe, it, expect } from "vitest";
import { StorySchema, DEFAULT_COMPETENCIES, DEFAULT_VOCAB, type Story } from "./types";

const story: Story = {
  id: "s1",
  projectId: "p1",
  bulletId: "b1",
  situation: "Security backlog had 400+ critical findings when I joined.",
  task: "Own the remediation programme across three platform teams.",
  action: "Triaged by exploitability, negotiated freeze windows with each team lead.",
  result: "Cut critical risks from 400+ to 20 in two quarters.",
  competencies: ["prioritisation", "influencing-without-authority"],
  numbers: ["400+", "20"],
  capturedAt: "2026-09-01",
};

describe("StorySchema", () => {
  it("accepts a complete story", () => {
    expect(StorySchema.parse(story)).toEqual(story);
  });

  it("allows bulletId to be null (a story need not back a bullet)", () => {
    expect(StorySchema.parse({ ...story, bulletId: null }).bulletId).toBeNull();
  });

  it("defaults competencies and numbers to empty arrays", () => {
    const { competencies: _c, numbers: _n, ...rest } = story;
    const parsed = StorySchema.parse(rest);
    expect(parsed.competencies).toEqual([]);
    expect(parsed.numbers).toEqual([]);
  });

  it("rejects a story with an empty result (no R means no STAR)", () => {
    expect(() => StorySchema.parse({ ...story, result: "" })).toThrow();
  });
});

describe("DEFAULT competency vocabulary", () => {
  it("ships the ten default competencies as the keys of the default vocab", () => {
    expect(DEFAULT_COMPETENCIES).toEqual([
      "leadership",
      "influencing-without-authority",
      "conflict",
      "failure",
      "ambiguity",
      "prioritisation",
      "stakeholder-management",
      "data-driven-decision",
      "delivery-under-pressure",
      "customer-insight",
    ]);
    expect(Object.keys(DEFAULT_VOCAB)).toEqual(DEFAULT_COMPETENCIES);
  });

  it("every default competency carries at least one trigger phrase", () => {
    for (const c of DEFAULT_COMPETENCIES) expect(DEFAULT_VOCAB[c].length).toBeGreaterThan(0);
  });
});
