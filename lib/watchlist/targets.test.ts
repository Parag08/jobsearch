import { describe, expect, it } from "vitest";
import type { SourcedJob } from "../types";
import { filterToTargets, hasTargets, matchesTargets, parseTargetList, type JobTargets } from "./targets";

const job = (title: string, location: string | null): SourcedJob => ({
  id: "x",
  source: "greenhouse",
  externalId: "1",
  title,
  company: "Acme",
  location,
  url: null,
  postedAt: null,
  score: null,
  status: "new",
});

const SG: JobTargets = {
  geos: ["Singapore"],
  titles: ["product manager", "program manager", "chief of staff", "head of engineering"],
  excludedTitles: ["designer", "sales", "intern"],
};

describe("matchesTargets - location", () => {
  it("keeps a role in a target city, including multi-city postings that list it", () => {
    expect(matchesTargets(job("Product Manager", "Singapore"), SG)).toBe(true);
    expect(matchesTargets(job("Product Manager", "Hong Kong; Jakarta, Indonesia; Singapore, Singapore"), SG)).toBe(true);
    expect(matchesTargets(job("Product Manager", "SINGAPORE - Remote"), SG)).toBe(true);
  });

  it("drops a role elsewhere, or with no location, once cities are declared", () => {
    expect(matchesTargets(job("Product Manager", "London"), SG)).toBe(false);
    expect(matchesTargets(job("Product Manager", null), SG)).toBe(false);
    expect(matchesTargets(job("Product Manager", ""), SG)).toBe(false);
  });
});

describe("matchesTargets - title", () => {
  it("keeps a title that contains a target phrase as whole words", () => {
    expect(matchesTargets(job("Senior Product Manager, Payments", "Singapore"), SG)).toBe(true);
    expect(matchesTargets(job("Chief of Staff to the CEO", "Singapore"), SG)).toBe(true);
    expect(matchesTargets(job("Head of Engineering, AI Transformation", "Singapore"), SG)).toBe(true);
  });

  it("drops a title with no target phrase", () => {
    expect(matchesTargets(job("Backend Engineer", "Singapore"), SG)).toBe(false);
  });

  it("drops an excluded title even when it also matches a target phrase", () => {
    expect(matchesTargets(job("Senior Product Designer, Integrity", "Singapore"), SG)).toBe(false);
    expect(matchesTargets(job("Sales Program Manager", "Singapore"), SG)).toBe(false);
  });

  it("matches whole words only - 'intern' never excludes 'internal'", () => {
    expect(matchesTargets(job("Program Manager, Internal Tools", "Singapore"), SG)).toBe(true);
    expect(matchesTargets(job("Product Manager Intern", "Singapore"), SG)).toBe(false);
  });

  it("ignores case, spacing and punctuation around a phrase", () => {
    expect(matchesTargets(job("PRODUCT  MANAGER (AI)", "Singapore"), SG)).toBe(true);
    expect(matchesTargets(job("Programme/Program Manager", "Singapore"), SG)).toBe(true);
  });
});

describe("empty targets", () => {
  it("an undeclared dimension filters nothing, so a new user still sees their boards", () => {
    const none: JobTargets = { geos: [], titles: [], excludedTitles: [] };
    expect(hasTargets(none)).toBe(false);
    expect(matchesTargets(job("Anything", null), none)).toBe(true);
    expect(matchesTargets(job("Backend Engineer", "Singapore"), { ...SG, titles: [] })).toBe(true);
    expect(matchesTargets(job("Product Manager", "London"), { ...SG, geos: [] })).toBe(true);
  });

  it("blank entries in the lists are ignored rather than matching everything", () => {
    const blanks: JobTargets = { geos: ["", " "], titles: [""], excludedTitles: [" "] };
    expect(hasTargets(blanks)).toBe(false);
    expect(matchesTargets(job("Backend Engineer", "London"), blanks)).toBe(true);
  });
});

describe("filterToTargets", () => {
  it("keeps only the matches, in order", () => {
    const jobs = [job("Product Manager", "Singapore"), job("Product Designer", "Singapore"), job("Program Manager", "London"), job("Chief of Staff", "Singapore")];
    expect(filterToTargets(jobs, SG).map((j) => j.title)).toEqual(["Product Manager", "Chief of Staff"]);
  });
});

describe("parseTargetList", () => {
  it("splits typed text on commas and new lines, trims, and drops blanks and repeats", () => {
    expect(parseTargetList("Singapore, Kuala Lumpur\n\n  Singapore ,")).toEqual(["Singapore", "Kuala Lumpur"]);
    expect(parseTargetList("product manager\nProduct Manager\nchief of staff")).toEqual(["product manager", "chief of staff"]);
    expect(parseTargetList("   ")).toEqual([]);
  });
});
