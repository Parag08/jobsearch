import { describe, it, expect } from "vitest";
import { collisionAudit, jaccard, repeatedPhraseAudit, significantWords } from "./audits";

describe("jaccard", () => {
  it("is |A∩B| / |A∪B|, and 0 when both sets are empty", () => {
    expect(jaccard(new Set(["a", "b", "c"]), new Set(["b", "c", "d"]))).toBeCloseTo(0.5);
    expect(jaccard(new Set(), new Set())).toBe(0);
    expect(jaccard(new Set(["a"]), new Set())).toBe(0);
  });
});

describe("significantWords", () => {
  it("lowercases, strips punctuation, drops stopwords and 1-2 letter tokens, keeps numbers", () => {
    expect(significantWords("Owned the Product Roadmap, defining 20+ core features for a $10K launch")).toEqual(
      new Set(["owned", "product", "roadmap", "defining", "20", "core", "features", "10k", "launch"]),
    );
  });
});

describe("collisionAudit", () => {
  const b = (id: string, text: string, skills: string[] = []) => ({ id, text, skills });

  it("flags a pair whose skill tags overlap heavily (basis: skills)", () => {
    const out = collisionAudit([
      b("x", "Grew ACV to $40M across enterprise accounts", ["Revenue", "enterprise-sales", "acv"]),
      b("y", "Owned pricing for the enterprise segment", ["revenue", "acv", "enterprise-sales", "pricing"]),
      b("z", "Mentored junior engineers", ["mentorship"]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ a: "x", b: "y", basis: "skills" });
    expect(out[0].skillSimilarity).toBeCloseTo(0.75);
  });

  it("flags a pair that says the same thing in words (basis: text) even with disjoint tags", () => {
    const out = collisionAudit([
      b("r1", "Developed the product roadmap, defining 20 core features", ["roadmap"]),
      b("r2", "Owned the product roadmap and defined 20 core features", ["ownership"]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ a: "r1", b: "r2", basis: "text" });
    expect(out[0].textSimilarity).toBeGreaterThanOrEqual(0.4);
  });

  it("thresholds are configurable", () => {
    const pair = [
      b("x", "alpha", ["a", "b", "c"]),
      b("y", "beta", ["a", "b", "c", "d"]), // skills jaccard 0.75
    ];
    expect(collisionAudit(pair)).toHaveLength(1);
    expect(collisionAudit(pair, { skillThreshold: 0.8 })).toHaveLength(0);
  });

  it("two bullets with no tags never collide on skills", () => {
    expect(collisionAudit([b("x", "one thing"), b("y", "another thing")])).toHaveLength(0);
  });

  it("reports each pair once, ordered by input position", () => {
    const out = collisionAudit([
      b("x", "", ["a", "b"]),
      b("y", "", ["a", "b"]), // 1.0 with x
      b("z", "", ["a", "b", "c", "d"]), // 0.5 with x and y
    ]);
    expect(out.map((c) => [c.a, c.b])).toEqual([
      ["x", "y"],
      ["x", "z"],
      ["y", "z"],
    ]);
    expect(out[0].skillSimilarity).toBe(1);
  });
});

describe("repeatedPhraseAudit", () => {
  const b = (id: string, text: string) => ({ id, text, skills: [] as string[] });

  it("flags a 3+ word phrase that appears in two bullets, with both ids", () => {
    const out = repeatedPhraseAudit([
      b("e", "Developed the product roadmap for a bootstrapped renovation platform"),
      b("m", "Took a blockchain platform to MVP, owning the product roadmap and the architecture"),
      b("n", "Led 11 engineers on a $500K budget"),
    ]);
    expect(out).toEqual([{ phrase: "the product roadmap", bulletIds: ["e", "m"] }]);
  });

  it("reports the longest repeated phrase once, not each of its sub-phrases", () => {
    const out = repeatedPhraseAudit([
      b("a", "Shipped the checkout, defining 20 core features with the team"),
      b("b", "Ran discovery, defining 20 core features with stakeholders"),
    ]);
    expect(out.map((r) => r.phrase)).toEqual(["defining 20 core features with"]);
  });

  it("ignores phrases made only of stopwords and repeats inside a single bullet", () => {
    const out = repeatedPhraseAudit([
      b("a", "and of the and of the"),
      b("b", "in and of the moment"),
      b("c", "go to market go to market"),
    ]);
    expect(out).toEqual([]);
  });

  it("is case- and punctuation-insensitive", () => {
    const out = repeatedPhraseAudit([b("a", "Cut fleet cost by 30%."), b("b", "...cut Fleet Cost by 30% again")]);
    expect(out).toEqual([{ phrase: "cut fleet cost by 30", bulletIds: ["a", "b"] }]);
  });

  it("minimum n-gram length is configurable", () => {
    const bullets = [b("a", "grew recurring revenue fast"), b("b", "recurring revenue doubled")];
    expect(repeatedPhraseAudit(bullets)).toEqual([]);
    expect(repeatedPhraseAudit(bullets, { minWords: 2 })).toEqual([{ phrase: "recurring revenue", bulletIds: ["a", "b"] }]);
  });
});
