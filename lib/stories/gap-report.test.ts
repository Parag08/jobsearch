import { describe, it, expect } from "vitest";
import { storyGapReport } from "./gap-report";
import type { JdExtract } from "../types";
import type { Story } from "./types";

const jd: JdExtract = {
  company: "Acme",
  role: "Senior Product Manager",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["Stakeholder management", "SQL"],
  keywords: ["cross-functional", "post-mortems", "difficult conversations", "led"],
  seniority: "senior",
  visaNote: null,
  location: null,
};

function story(id: string, competencies: string[]): Story {
  return {
    id,
    projectId: "p1",
    bulletId: null,
    situation: "s",
    task: "t",
    action: "a",
    result: "r",
    competencies,
    numbers: [],
    capturedAt: "2026-09-01",
  };
}

describe("storyGapReport", () => {
  it("names the competencies the JD asks for that no story covers", () => {
    const stories = [
      story("s1", ["leadership", "stakeholder-management"]),
      story("s2", ["data-driven-decision"]),
    ];
    const report = storyGapReport(jd, stories);
    expect(report.covered).toEqual(["leadership", "stakeholder-management", "data-driven-decision"]);
    // "you have no story for failure, conflict, or influencing without authority"
    expect(report.missing).toEqual(["influencing-without-authority", "conflict", "failure"]);
  });

  it("lists the story ids behind each demanded competency, empty when missing", () => {
    const stories = [story("s1", ["leadership"]), story("s2", ["Leadership", "conflict"])];
    const report = storyGapReport(jd, stories);
    expect(report.storiesByCompetency).toEqual({
      leadership: ["s1", "s2"],
      "influencing-without-authority": [],
      conflict: ["s2"],
      failure: [],
      "stakeholder-management": [],
      "data-driven-decision": [],
    });
  });

  it("with no stories, everything demanded is missing", () => {
    const report = storyGapReport(jd, []);
    expect(report.covered).toEqual([]);
    expect(report.missing).toHaveLength(6);
  });

  it("ignores story competencies the JD does not demand", () => {
    const report = storyGapReport(jd, [story("s1", ["customer-insight"])]);
    expect(report.covered).toEqual([]);
    expect(report.storiesByCompetency["customer-insight"]).toBeUndefined();
  });

  it("respects a caller-supplied vocabulary", () => {
    const vocab = { "cost-control": ["sql"], "safety-culture": ["incident"] };
    const report = storyGapReport(jd, [story("s1", ["cost-control"])], vocab);
    expect(report).toEqual({
      covered: ["cost-control"],
      missing: [],
      storiesByCompetency: { "cost-control": ["s1"] },
    });
  });
});
