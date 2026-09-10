import { describe, it, expect } from "vitest";
import { applicationGaps } from "./gaps";
import type { Bullet, JdExtract } from "../types";

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

  it("never invents evidence: a plausible-but-untagged term stays a gap", () => {
    const g = applicationGaps({ ...jd, skills: ["due diligence"], keywords: [] }, bank);
    expect(g.gaps).toEqual([{ term: "due diligence", kind: "skill" }]);
  });
});
