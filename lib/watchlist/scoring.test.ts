import { describe, it, expect } from "vitest";
import { scoreJob } from "../scoring";
import type { SectorNode, SourcedJob } from "../types";
import { scoreSourcedJob, type ScoringContext } from "./scoring";
import type { WatchlistEntry } from "./types";

const node: SectorNode = {
  id: "n1",
  path: ["IT", "AI", "Singapore"],
  skills: {},
  companies: ["Other Co"],
  titles: [],
  jdCount: 1,
  summary: "",
};

function job(over: Partial<SourcedJob> = {}): SourcedJob {
  return {
    id: "j",
    source: "greenhouse",
    externalId: "1",
    title: "Senior Associate, TIG",
    company: "Target Co",
    location: null,
    url: null,
    postedAt: null,
    score: null,
    status: "new",
    ...over,
  };
}

function entry(company: string): WatchlistEntry {
  return {
    id: "w-" + company,
    company,
    careersUrl: "https://boards.greenhouse.io/x",
    ats: "greenhouse",
    token: "x",
    active: true,
    addedAt: "2026-09-10",
  };
}

const skills = ["product strategy", "roadmap", "llm evals"];

const ctx: ScoringContext = {
  node,
  evidencedSkills: skills,
  contacts: [],
  watchlist: [entry("Target Co")],
};

describe("scoreSourcedJob", () => {
  it("a target-company job with ZERO title overlap outranks a non-target job with FULL title overlap", () => {
    const target = scoreSourcedJob(job(), ctx); // "Senior Associate, TIG" matches no skill
    const nonTarget = scoreSourcedJob(
      job({ company: "Random Co", title: "Product Strategy & Roadmap PM (LLM evals)" }),
      ctx,
    );
    expect(target).toBeGreaterThan(nonTarget);
  });

  it("matches the watchlist by norm(company) and ignores inactive entries", () => {
    const loose = scoreSourcedJob(job({ company: "  target   CO " }), ctx);
    const base = scoreJob(job(), node, skills, []);
    expect(loose).toBeGreaterThan(base);

    const inactive: ScoringContext = { ...ctx, watchlist: [{ ...entry("Target Co"), active: false }] };
    expect(scoreSourcedJob(job(), inactive)).toBe(base);
  });

  it("equals scoreJob for a non-target company (no boost, nothing else changed)", () => {
    const j = job({ company: "Random Co", title: "Roadmap PM", location: "Singapore" });
    expect(scoreSourcedJob(j, ctx)).toBe(scoreJob(j, node, skills, []));
  });

  it("clamps to 0-100 when every signal fires", () => {
    const rich: ScoringContext = {
      ...ctx,
      node: { ...node, companies: ["Target Co"] },
      contacts: [
        {
          id: "c1",
          name: "X",
          network: null,
          company: "Target Co",
          role: null,
          location: null,
          warmth: "hot",
          status: "met",
          interests: [],
          interactions: [],
          nextFollowup: null,
        },
      ],
    };
    const s = scoreSourcedJob(job({ title: "Product Strategy Roadmap LLM evals", location: "Singapore" }), rich);
    expect(s).toBe(100);
  });
});
