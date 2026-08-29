import { describe, it, expect } from "vitest";
import { scoreJob } from "./scoring";
import type { Contact, SectorNode, SourcedJob } from "./types";

const node: SectorNode = {
  id: "it-ai-sg",
  path: ["IT", "AI", "Singapore"],
  skills: { "llm products": 5, sql: 3, experimentation: 2 },
  companies: ["Grab", "Sea Group"],
  titles: [],
  jdCount: 5,
  summary: "",
};

function job(over: Partial<SourcedJob> = {}): SourcedJob {
  return {
    id: "j1",
    source: "adzuna",
    externalId: null,
    title: "Product Manager, AI",
    company: "Grab",
    location: "Singapore",
    url: null,
    postedAt: null,
    score: null,
    status: "new",
    ...over,
  };
}

function contactAt(company: string): Contact {
  return {
    id: "c-" + company,
    name: "X",
    network: null,
    company,
    role: null,
    location: null,
    warmth: "warm",
    status: "met",
    interests: [],
    interactions: [],
    nextFollowup: null,
  };
}

describe("scoreJob", () => {
  it("scores 0-100 and ranks a known-company + network job above an unknown one", () => {
    const known = scoreJob(job(), node, ["llm products", "sql"], [contactAt("Grab")]);
    const unknown = scoreJob(job({ company: "Mystery Pte" }), node, ["llm products", "sql"], []);
    expect(known).toBeGreaterThan(unknown);
    expect(known).toBeLessThanOrEqual(100);
    expect(unknown).toBeGreaterThanOrEqual(0);
  });

  it("gives the network boost only when a contact works at the company", () => {
    const withNet = scoreJob(job(), node, [], [contactAt("Grab")]);
    const withoutNet = scoreJob(job(), node, [], [contactAt("Sea Group")]);
    expect(withNet).toBeGreaterThan(withoutNet);
  });

  it("rewards title overlap with the user's evidenced skills", () => {
    const aiTitle = scoreJob(job({ company: "Z", title: "PM - LLM products" }), node, ["llm products"], []);
    const plainTitle = scoreJob(job({ company: "Z", title: "PM - logistics" }), node, ["llm products"], []);
    expect(aiTitle).toBeGreaterThan(plainTitle);
  });
});
