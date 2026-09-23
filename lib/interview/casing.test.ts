import { describe, it, expect } from "vitest";
import type { Bullet } from "../types";
import { caseTypeFits, DEFAULT_CASE_VOCAB } from "./casing";

const bullet = (id: string, text: string, skills: string[] = []): Bullet => ({
  id,
  projectId: "p1",
  roleFamily: "general",
  text,
  skills,
});

const bank = [
  bullet("valeo-cost", "Traced an 18% rise in fleet operating cost against 0% revenue growth to its underlying drivers", ["data-analysis", "pricing"]),
  bullet("valeo-strategy", "Developed two strategies to cut fleet cost by up to 30% by consolidating verticals and building a hub network", ["ops-execution", "scaling-ops"]),
  bullet("move-dd", "Owned the technical due diligence on Nutanix Move, cutting 400+ security risks to 20", ["research", "compliance"]),
];

describe("caseTypeFits", () => {
  it("marks a case type LIVED when a bullet evidences it", () => {
    const fits = caseTypeFits(bank);
    const cost = fits.find((f) => f.caseType === "cost-reduction");
    expect(cost?.lived).toBe(true);
    expect(cost?.evidence).toContain("valeo-cost");
  });

  it("marks a case type unlived when nothing in the bank touches it", () => {
    // Deliberately inert: a coaching bullet would legitimately evidence org-and-people,
    // which is the behaviour we want, so it cannot be the negative case.
    const fits = caseTypeFits([bullet("x", "Presented at a student conference", ["public-speaking"])]);
    expect(fits.every((f) => f.lived === false)).toBe(true);
  });

  it("returns every case type in the vocabulary, not only the matches", () => {
    const fits = caseTypeFits(bank);
    expect(fits.map((f) => f.caseType).sort()).toEqual(Object.keys(DEFAULT_CASE_VOCAB).sort());
  });

  it("puts lived case types first - those are the ones to open with", () => {
    const fits = caseTypeFits(bank);
    const firstUnlived = fits.findIndex((f) => !f.lived);
    const lastLived = fits.map((f) => f.lived).lastIndexOf(true);
    expect(lastLived).toBeLessThan(firstUnlived);
  });

  it("finds due diligence, which is a real case archetype and one he has actually run", () => {
    const dd = caseTypeFits(bank).find((f) => f.caseType === "due-diligence");
    expect(dd?.lived).toBe(true);
    expect(dd?.evidence).toContain("move-dd");
  });

  it("treats the case vocabulary as data, so a firm-specific type can be added (rule 4)", () => {
    const fits = caseTypeFits(bank, { "public-sector": ["due diligence"] });
    expect(fits).toHaveLength(1);
    expect(fits[0]).toMatchObject({ caseType: "public-sector", lived: true });
  });

  it("handles an empty bank without throwing", () => {
    expect(caseTypeFits([]).every((f) => f.lived === false)).toBe(true);
  });
});
