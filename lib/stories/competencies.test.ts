import { describe, it, expect } from "vitest";
import { inferCompetencies, matchCompetencies } from "./competencies";
import type { JdExtract } from "../types";
import type { CompetencyVocab } from "./types";

const base: JdExtract = {
  company: "Acme",
  role: "Product Manager",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: [],
  keywords: [],
  seniority: null,
  visaNote: null,
  location: null,
};

describe("inferCompetencies (default vocab)", () => {
  it("maps 'stakeholder' to stakeholder-management", () => {
    expect(inferCompetencies({ ...base, skills: ["Stakeholder management"] })).toEqual([
      "stakeholder-management",
    ]);
  });

  it("maps 'ambiguous' and '0 to 1' to ambiguity", () => {
    expect(inferCompetencies({ ...base, keywords: ["ambiguous environments"] })).toEqual(["ambiguity"]);
    expect(inferCompetencies({ ...base, keywords: ["0 to 1 products"] })).toEqual(["ambiguity"]);
    expect(inferCompetencies({ ...base, keywords: ["0-to-1"] })).toEqual(["ambiguity"]);
  });

  it("maps 'cross-functional' to influencing-without-authority", () => {
    expect(inferCompetencies({ ...base, skills: ["cross-functional collaboration"] })).toEqual([
      "influencing-without-authority",
    ]);
    expect(inferCompetencies({ ...base, skills: ["Cross functional teams"] })).toEqual([
      "influencing-without-authority",
    ]);
  });

  it("maps 'lead'/'led' to leadership, on whole words only", () => {
    expect(inferCompetencies({ ...base, keywords: ["led a team"] })).toEqual(["leadership"]);
    expect(inferCompetencies({ ...base, keywords: ["lead the roadmap"] })).toContain("leadership");
    // 'misled' is not 'led'
    expect(inferCompetencies({ ...base, keywords: ["misled customers"] })).not.toContain("leadership");
  });

  it("reads seniority too: 'senior' implies leadership questions", () => {
    expect(inferCompetencies({ ...base, seniority: "senior" })).toEqual(["leadership"]);
  });

  it("returns competencies in vocab order, each at most once, and is deterministic", () => {
    const jd = {
      ...base,
      skills: ["SQL", "Stakeholder management", "A/B testing"],
      keywords: ["led", "leadership", "conflict resolution"],
    };
    const a = inferCompetencies(jd);
    const b = inferCompetencies(jd);
    expect(a).toEqual(b);
    expect(a).toEqual(["leadership", "conflict", "stakeholder-management", "data-driven-decision"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(inferCompetencies({ ...base, skills: ["Figma"] })).toEqual([]);
  });

  it("uses a caller-supplied vocabulary instead of the shipped template", () => {
    const vocab: CompetencyVocab = {
      "safety-culture": ["safety", "incident"],
      "cost-control": ["budget", "cost"],
    };
    const jd = { ...base, keywords: ["incident response", "stakeholders"] };
    expect(inferCompetencies(jd, vocab)).toEqual(["safety-culture"]);
  });
});

describe("matchCompetencies", () => {
  it("reports which phrases triggered each competency", () => {
    const hits = matchCompetencies("Cross-functional stakeholder alignment", {
      "influencing-without-authority": ["cross-functional", "alignment"],
      "stakeholder-management": ["stakeholder"],
      leadership: ["led"],
    });
    expect(hits).toEqual([
      { competency: "influencing-without-authority", matched: ["cross-functional", "alignment"] },
      { competency: "stakeholder-management", matched: ["stakeholder"] },
    ]);
  });
});
