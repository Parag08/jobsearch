import { describe, it, expect } from "vitest";
import { extractNumbers, canonicalNumber, numberConsistency } from "./consistency";
import type { Bullet } from "../types";
import type { Story } from "./types";

function bullet(text: string): Bullet {
  return { id: "b1", projectId: "p1", roleFamily: "product-management", text, skills: [] };
}

function story(partial: Partial<Story>): Story {
  return {
    id: "s1",
    projectId: "p1",
    bulletId: "b1",
    situation: "",
    task: "",
    action: "",
    result: "",
    competencies: [],
    numbers: [],
    capturedAt: "2026-09-01",
    ...partial,
  };
}

describe("extractNumbers", () => {
  it("captures plain integers, percentages and plus-suffixed counts", () => {
    expect(extractNumbers("Cut 400+ critical security risks to 20, a 95% reduction")).toEqual([
      "400+",
      "20",
      "95%",
    ]);
  });

  it("captures currency with decimals and scale suffixes", () => {
    expect(extractNumbers("Closed $2.1M ACV and S$300k pipeline; 1,200 seats")).toEqual([
      "$2.1M",
      "S$300k",
      "1,200",
    ]);
  });

  it("captures multipliers and spelled-out scales", () => {
    expect(extractNumbers("10x faster; 2 million users; 3.5 bn requests")).toEqual([
      "10x",
      "2 million",
      "3.5 bn",
    ]);
  });

  it("does not treat words as numbers", () => {
    expect(extractNumbers("Delivered in two quarters with three teams")).toEqual([]);
  });

  it("does not split identifiers, ordinals or versions into numbers", () => {
    expect(extractNumbers("Shipped v2 in Q3 as the 1st release of GPT-4o")).toEqual([]);
  });

  it("skips bare years, which are dates not metrics", () => {
    expect(extractNumbers("Joined in 2023 and grew revenue 20% by 2024")).toEqual(["20%"]);
  });

  it("captures a leading '+' as part of the number when it is a delta", () => {
    expect(extractNumbers("Drove roadmap across 3 products, +20% engagement")).toEqual(["3", "20%"]);
  });
});

describe("canonicalNumber", () => {
  it("strips currency, %, + and commas and normalises scale suffixes", () => {
    expect(canonicalNumber("$2.1M")).toBe("2.1M");
    expect(canonicalNumber("2.1 million")).toBe("2.1M");
    expect(canonicalNumber("S$300k")).toBe("300K");
    expect(canonicalNumber("400+")).toBe("400");
    expect(canonicalNumber("30%")).toBe("30");
    expect(canonicalNumber("1,200")).toBe("1200");
    expect(canonicalNumber("3.5 bn")).toBe("3.5B");
    expect(canonicalNumber("10x")).toBe("10X");
  });
});

describe("numberConsistency", () => {
  it("is ok when every number on the bullet appears in the story", () => {
    const r = numberConsistency(
      story({ result: "We went from about 400 critical risks down to 20." }),
      bullet("Cut 400+ critical security risks to 20"),
    );
    expect(r.ok).toBe(true);
    expect(r.unmatched).toEqual([]);
    expect(r.bulletNumbers).toEqual(["400+", "20"]);
  });

  it("reports bullet numbers the story never states", () => {
    const r = numberConsistency(
      story({ result: "Engagement went up a lot across the products." }),
      bullet("Drove roadmap across 3 products, +20% engagement"),
    );
    expect(r.ok).toBe(false);
    expect(r.unmatched).toEqual(["3", "20%"]);
  });

  it("matches across surface forms: '$2.1M' on the CV vs '2.1 million' said out loud", () => {
    const r = numberConsistency(
      story({ action: "I closed roughly 2.1 million in ACV that year." }),
      bullet("Closed $2.1M ACV"),
    );
    expect(r.ok).toBe(true);
  });

  it("counts the user's own stated metric strings (story.numbers) as evidence", () => {
    const r = numberConsistency(story({ numbers: ["30%"] }), bullet("Lifted retention 30%"));
    expect(r.ok).toBe(true);
  });

  it("does not read the situation or task as evidence for a result number", () => {
    const r = numberConsistency(
      story({ situation: "Retention was 30% below plan.", result: "Retention recovered." }),
      bullet("Lifted retention 30%"),
    );
    expect(r.ok).toBe(false);
    expect(r.unmatched).toEqual(["30%"]);
  });

  it("is ok for a bullet with no numbers at all", () => {
    const r = numberConsistency(story({}), bullet("Owned the roadmap"));
    expect(r).toEqual({ ok: true, bulletNumbers: [], storyNumbers: [], unmatched: [] });
  });
});
