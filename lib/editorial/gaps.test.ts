import { describe, it, expect } from "vitest";
import { applicationGaps } from "./gaps";
import type { Bullet, JdExtract, Project } from "../types";

const jd: JdExtract = {
  company: "Firm X",
  role: "Consultant",
  roleFamily: "consulting",
  sectorPath: ["Consulting", "PE"],
  skills: ["Product Strategy", "technology due diligence", "People  Management"],
  keywords: ["Kubernetes", "revenue", "PE investors", "cursor", "REVENUE"],
  seniority: null,
  visaNote: null,
  location: null,
};

const bank: Bullet[] = [
  { id: "b1", projectId: "p1", roleFamily: "product-management", text: "Set the product direction for a platform", skills: ["product strategy"] },
  { id: "b2", projectId: "p2", roleFamily: "engineering", text: "Ran Kubernetes clusters generating $1M recurring revenue", skills: ["infrastructure"] },
  {
    id: "b3",
    projectId: "p3",
    roleFamily: "consulting",
    text: "Diagnosed fleet cost drivers",
    skills: ["analysis"],
    variants: [{ label: "tool-forward", text: "Diagnosed fleet cost drivers using Cursor" }],
  },
];

describe("applicationGaps", () => {
  const out = applicationGaps(jd, bank);

  it("lists JD skills and keywords with no evidencing bullet, normalized and deduped, in JD order", () => {
    expect(out.gaps).toEqual([
      { term: "technology due diligence", kind: "skill" },
      { term: "people management", kind: "skill" },
      { term: "pe investors", kind: "keyword" },
    ]);
  });

  it("a skill tag match, a text match, or a variant text match all count as evidence, with the bullet ids", () => {
    expect(out.evidenced).toEqual([
      { term: "product strategy", kind: "skill", bulletIds: ["b1"] },
      { term: "kubernetes", kind: "keyword", bulletIds: ["b2"] },
      { term: "revenue", kind: "keyword", bulletIds: ["b2"] },
      { term: "cursor", kind: "keyword", bulletIds: ["b3"] },
    ]);
  });

  it("an empty bank makes every requirement a gap", () => {
    const empty = applicationGaps(jd, []);
    expect(empty.evidenced).toEqual([]);
    expect(empty.gaps.map((g) => g.term)).toEqual([
      "product strategy",
      "technology due diligence",
      "people management",
      "kubernetes",
      "revenue",
      "pe investors",
      "cursor",
    ]);
  });

  it("the role a bullet sits under is evidence: a degree held is a fact on the record", () => {
    const edu: Bullet = { id: "e1", projectId: "insead", roleFamily: "consulting", text: "President, Fintech Club", skills: [] };
    const projects: Project[] = [
      {
        id: "insead",
        name: "INSEAD - MBA Class of December 2026",
        org: "INSEAD",
        dates: "2026",
        role: "MBA Class of December 2026",
        narrative: "",
        outcomes: [],
        skills: [],
        sectorTags: [],
        bullets: [edu],
      },
    ];
    const g = applicationGaps({ ...jd, skills: [], keywords: ["MBA", "INSEAD", "due diligence"] }, [edu], projects);
    expect(g.evidenced).toEqual([
      { term: "mba", kind: "keyword", bulletIds: ["e1"] },
      { term: "insead", kind: "keyword", bulletIds: ["e1"] },
    ]);
    expect(g.gaps).toEqual([{ term: "due diligence", kind: "keyword" }]);
  });

  it("a word inside a heading word is not evidence", () => {
    const b: Bullet = { id: "x1", projectId: "p", roleFamily: "consulting", text: "Led a squad", skills: [] };
    const p = { id: "p", name: "Acme - Programme Manager", org: "Acme", dates: null, role: "Programme Manager", narrative: "", outcomes: [], skills: [], sectorTags: [], bullets: [b] };
    const g = applicationGaps({ ...jd, skills: [], keywords: ["ram"] }, [b], [p]);
    expect(g.gaps).toEqual([{ term: "ram", kind: "keyword" }]);
  });

  it("never invents evidence: a plausible-but-untagged term stays a gap", () => {
    const g = applicationGaps({ ...jd, skills: ["due diligence"], keywords: [] }, bank);
    expect(g.gaps).toEqual([{ term: "due diligence", kind: "skill" }]);
  });
});
