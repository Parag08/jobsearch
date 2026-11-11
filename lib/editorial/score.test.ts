import { describe, it, expect } from "vitest";
import type { Project } from "../types";
import { distinctiveTokens, jdSignals, recencyRanks, scoreBullets, tagDemand, withExtractDemand, type Taxonomy } from "./score";

/**
 * Port of the findparagjob scorer (tools/cv-builder/lib/score.js): transparent, no
 * model call - every number traces back to a literal phrase in the JD.
 */
const taxonomy: Taxonomy = {
  tags: {
    "cross-functional": ["stakeholder", "cross-functional", "partner with"],
    "customer-facing": ["customer", "client"],
    migration: ["migrate", "migration"],
    ai: ["ai", "machine learning"],
  },
};

describe("tagDemand", () => {
  it("scores distinct phrases far above the same phrase repeated, capped at 5", () => {
    const d = tagDemand("Partner with stakeholders. Stakeholder alignment. Our stakeholder map.", taxonomy);
    // two distinct phrases (stakeholder, partner with); "stakeholder" x3 adds 2 repeats * 0.25
    expect(d["cross-functional"]!.demand).toBeCloseTo(2.5);
    expect(d["cross-functional"]!.phrases).toEqual(["stakeholder", "partner with"]);
  });

  it("matches a single-word phrase on a word boundary only", () => {
    expect(tagDemand("He said the main thing", taxonomy).ai).toBeUndefined();
    expect(tagDemand("Applied AI solutions", taxonomy).ai!.demand).toBe(1);
  });
});

describe("distinctiveTokens", () => {
  it("keeps words of five letters or more that are not stopwords or bare numbers", () => {
    expect([...distinctiveTokens("We migrate 20000 workloads with strong customers")].sort()).toEqual([
      "customers",
      "migrate",
      "workloads",
    ]);
  });
});

const project = (id: string, dates: string, bullets: Project["bullets"]): Project => ({
  id, name: id, org: id, dates, role: "r", narrative: "", outcomes: [], skills: [], sectorTags: [], bullets,
});
const bullet = (id: string, projectId: string, text: string, skills: string[], extra: object = {}) => ({
  id, projectId, roleFamily: "general", text, skills, ...extra,
});

describe("distinctiveTokens punctuation", () => {
  it("matches a word at the end of a sentence (score.js kept the full stop and missed it)", () => {
    expect(distinctiveTokens("We own the roadmap.").has("roadmap")).toBe(true);
  });
});

describe("withExtractDemand", () => {
  it("counts the extract's skills and keywords as demand for bullet tags of the same name", () => {
    const s = withExtractDemand({ demand: {}, tokens: [] }, { skills: ["LLM evals"], keywords: ["genai"] });
    expect(s.demand["llm evals"]).toEqual({ demand: 1, phrases: ["LLM evals"] });
    const projects = [project("p", "2026", [bullet("b", "p", "Ran evaluations", ["llm evals"])])];
    expect(scoreBullets(s, projects)[0]!.relevance).toBeGreaterThan(0);
  });

  it("never lowers demand the taxonomy already found", () => {
    const s = withExtractDemand({ demand: { genai: { demand: 3, phrases: ["genai"] } }, tokens: [] }, { skills: [], keywords: ["genai"] });
    expect(s.demand.genai!.demand).toBe(3);
  });
});

describe("recencyRanks", () => {
  it("ranks roles most recent first from their dates", () => {
    const ranks = recencyRanks([project("old", "2016 - 2018", []), project("now", "Jul - Aug 2026", []), project("mid", "2024 - 2025", [])]);
    expect([...ranks.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)).toEqual(["now", "mid", "old"]);
  });
});

describe("scoreBullets", () => {
  const jd = "Technical Account Manager: help customers migrate workloads and partner with stakeholders.";
  const signals = jdSignals(jd, taxonomy);
  const projects = [
    project("recent", "2025 - 2026", [
      bullet("tagged", "recent", "Moved a bank onto new infrastructure", ["migration", "customer-facing"]),
      bullet("echo", "recent", "Shipped workloads dashboards", []),
    ]),
    project("older", "2016 - 2018", [
      bullet("old-tagged", "older", "Moved a bank onto new infrastructure", ["migration", "customer-facing"]),
      bullet("strong", "older", "Moved a bank onto new infrastructure", ["migration", "customer-facing"], { strength: 5 }),
      bullet("variant", "older", "Built a thing", [], {
        variants: [{ label: "customer-forward", text: "Helped customers migrate workloads" }],
      }),
    ]),
  ];
  const scored = scoreBullets(signals, projects);
  const by = (id: string) => scored.find((s) => s.bulletId === id)!;

  it("ranks a bullet whose tags the JD demands above one that only echoes a word", () => {
    expect(by("tagged").score).toBeGreaterThan(by("echo").score);
    expect(by("tagged").matchedTags.map((t) => t.tag).sort()).toEqual(["customer-facing", "migration"]);
    expect(by("echo").echoedWords).toEqual(["workloads"]);
  });

  it("nudges by recency and the owner's strength, and reports every part of the score", () => {
    expect(by("tagged").score).toBeGreaterThan(by("old-tagged").score);
    expect(by("strong").score).toBeGreaterThan(by("old-tagged").score);
    expect(by("tagged").breakdown.tags).toBeGreaterThan(0);
    expect(by("tagged").breakdown.recency).toBeGreaterThan(by("old-tagged").breakdown.recency);
  });

  it("separates relevance (tags + echo) from the nudges, so 'irrelevant' still means irrelevant", () => {
    expect(by("old-tagged").relevance).toBeGreaterThan(0);
    expect(scoreBullets(jdSignals("Nothing in common here", taxonomy), projects).every((s) => s.relevance === 0)).toBe(true);
  });

  it("suggests the variant that echoes the JD hardest, null when the default already wins", () => {
    expect(by("variant").suggestedVariant).toBe("customer-forward");
    expect(by("tagged").suggestedVariant).toBeNull();
  });

  it("returns best first", () => {
    expect(scored.map((s) => s.score)).toEqual([...scored.map((s) => s.score)].sort((a, b) => b - a));
  });
});

describe("jdSignals", () => {
  it("is compact enough to store on the JD extract: tag demand plus the JD's distinctive words", () => {
    const s = jdSignals("Help customers migrate workloads", taxonomy);
    expect(Object.keys(s.demand).sort()).toEqual(["customer-facing", "migration"]);
    expect(s.tokens).toEqual(["customers", "migrate", "workloads"]);
  });
});
