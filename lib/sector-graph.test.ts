import { describe, it, expect } from "vitest";
import { findOrCreateNode, mergeJdExtract, topSkills, gapAnalysis } from "./sector-graph";
import type { JdExtract, SectorNode } from "./types";

const jd: JdExtract = {
  company: "Grab",
  role: "Product Manager, AI Platform",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["LLM product experience", "Experimentation", "SQL"],
  keywords: ["GenAI", "platform"],
  seniority: "senior",
  visaNote: "EP sponsorship stated",
  location: "Singapore",
};

describe("findOrCreateNode", () => {
  it("creates a node for a new sector path", () => {
    const nodes: SectorNode[] = [];
    const node = findOrCreateNode(nodes, ["IT", "AI", "Singapore"]);
    expect(node.path).toEqual(["IT", "AI", "Singapore"]);
    expect(node.jdCount).toBe(0);
    expect(nodes).toHaveLength(1);
  });

  it("matches an existing node case-insensitively", () => {
    const nodes: SectorNode[] = [];
    const a = findOrCreateNode(nodes, ["IT", "AI", "Singapore"]);
    const b = findOrCreateNode(nodes, ["it", "ai", "singapore"]);
    expect(b).toBe(a);
    expect(nodes).toHaveLength(1);
  });
});

describe("mergeJdExtract", () => {
  it("increments jdCount and accumulates skill frequencies (normalized)", () => {
    const nodes: SectorNode[] = [];
    const node = findOrCreateNode(nodes, jd.sectorPath);
    mergeJdExtract(node, jd);
    mergeJdExtract(node, { ...jd, skills: ["llm product experience", "Stakeholder management"] });
    expect(node.jdCount).toBe(2);
    expect(node.skills["llm product experience"]).toBe(2);
    expect(node.skills["sql"]).toBe(1);
    expect(node.skills["stakeholder management"]).toBe(1);
  });

  it("adds companies and titles without duplicates", () => {
    const nodes: SectorNode[] = [];
    const node = findOrCreateNode(nodes, jd.sectorPath);
    mergeJdExtract(node, jd);
    mergeJdExtract(node, jd);
    expect(node.companies).toEqual(["Grab"]);
    expect(node.titles).toEqual(["Product Manager, AI Platform"]);
  });
});

describe("topSkills", () => {
  it("returns the n most frequent skills, most frequent first", () => {
    const nodes: SectorNode[] = [];
    const node = findOrCreateNode(nodes, jd.sectorPath);
    node.skills = { sql: 5, genai: 9, experimentation: 2 };
    expect(topSkills(node, 2)).toEqual(["genai", "sql"]);
  });
});

describe("gapAnalysis", () => {
  it("splits sector-demanded skills into evidenced (emphasise) and missing", () => {
    const nodes: SectorNode[] = [];
    const node = findOrCreateNode(nodes, jd.sectorPath);
    node.skills = { sql: 3, "llm product experience": 5, "growth loops": 2 };
    const res = gapAnalysis(node, ["SQL", "LLM Product Experience"]);
    expect(res.emphasise).toEqual(["llm product experience", "sql"]);
    expect(res.missing).toEqual(["growth loops"]);
  });
});
