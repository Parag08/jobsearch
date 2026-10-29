import { describe, it, expect } from "vitest";
import { competencyPrep } from "./prep-view";
import { prepSet } from "./prep";
import type { Bullet, JdExtract } from "../types";
import type { Story } from "./types";

const jd: JdExtract = {
  company: "Acme",
  role: "Product Manager",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["Stakeholder management", "A/B testing"],
  keywords: ["post-mortems"],
  seniority: null,
  visaNote: null,
  location: null,
};

const bank: Record<string, Bullet> = {
  b1: { id: "b1", projectId: "p1", roleFamily: "product-management", text: "Briefed executives weekly on 400+ risks", skills: [] },
  b2: { id: "b2", projectId: "p2", roleFamily: "product-management", text: "Ran experiments that lifted conversion 12%", skills: ["SQL"] },
  b3: { id: "b3", projectId: "p3", roleFamily: "product-management", text: "Hired two analysts", skills: [] },
};

function story(id: string, competencies: string[]): Story {
  return { id, projectId: "p1", bulletId: "b1", situation: "s", task: "t", action: "a", result: "r", competencies, numbers: [], capturedAt: "2026-09-01" };
}

const stories: Story[] = [story("s1", ["stakeholder-management"])];

const questions = [
  { id: "q-fail", competency: "failure" },
  { id: "q-data-1", competency: "data-driven-decision" },
  { id: "q-data-2", competency: "Data-Driven-Decision" },
];

describe("competencyPrep", () => {
  const prep = prepSet(["b1", "b2", "b3"], bank, stories, jd);
  const rows = competencyPrep(prep, stories, questions);

  it("lists every competency the JD demands, in the gap report's order", () => {
    expect(rows.map((r) => r.competency)).toEqual(["failure", "stakeholder-management", "data-driven-decision"]);
  });

  it("a competency with a story is ready, and carries the story itself", () => {
    const r = rows.find((x) => x.competency === "stakeholder-management")!;
    expect(r.status).toBe("story");
    expect(r.stories.map((s) => s.id)).toEqual(["s1"]);
  });

  it("with no story, a bullet on this CV that evidences it is the fallback - raw material, not an answer", () => {
    const r = rows.find((x) => x.competency === "data-driven-decision")!;
    expect(r.status).toBe("bullet");
    expect(r.stories).toEqual([]);
    expect(r.bullets.map((b) => b.id)).toEqual(["b2"]);
  });

  it("with neither a story nor a CV bullet, it is a gap", () => {
    const r = rows.find((x) => x.competency === "failure")!;
    expect(r.status).toBe("gap");
    expect(r.bullets).toEqual([]);
  });

  it("only bullets on this application's CV count, not the whole bank", () => {
    const narrow = competencyPrep(prepSet(["b3"], bank, [], jd), [], questions);
    expect(narrow.find((x) => x.competency === "data-driven-decision")!.status).toBe("gap");
  });

  it("links each competency to the first bank question with the same label (norm-matched), or null", () => {
    expect(rows.find((x) => x.competency === "failure")!.questionId).toBe("q-fail");
    expect(rows.find((x) => x.competency === "data-driven-decision")!.questionId).toBe("q-data-1");
    expect(rows.find((x) => x.competency === "stakeholder-management")!.questionId).toBeNull();
  });

  it("is empty when the JD demands no competency", () => {
    const quiet: JdExtract = { ...jd, role: "Analyst", skills: [], keywords: [] };
    expect(competencyPrep(prepSet(["b1"], bank, stories, quiet), stories, questions)).toEqual([]);
  });
});
