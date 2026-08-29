import { describe, it, expect } from "vitest";
import { buildDiff, applyDiff } from "./cv-diff";
import type { Bullet, JdExtract, MasterCv } from "./types";

const master: MasterCv = {
  id: "m1",
  roleFamily: "product-management",
  summaryLine: "Product manager with fintech depth.",
  bulletIds: ["b1", "b2", "b3"],
  version: 1,
};

const bank: Record<string, Bullet> = {
  b1: { id: "b1", projectId: "p1", roleFamily: "product-management", text: "Did payments", skills: ["payments"] },
  b2: { id: "b2", projectId: "p1", roleFamily: "product-management", text: "Did discovery", skills: ["product discovery"] },
  b3: { id: "b3", projectId: "p2", roleFamily: "product-management", text: "Did ops", skills: ["operations"] },
  b9: { id: "b9", projectId: "p3", roleFamily: "product-management", text: "Shipped LLM feature", skills: ["llm products"] },
};

const jd: JdExtract = {
  company: "Grab",
  role: "PM, AI Platform",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["llm products", "payments"],
  keywords: ["genai", "quantum teleportation"],
  seniority: null,
  visaNote: null,
  location: "Singapore",
};

describe("buildDiff", () => {
  it("adds high-scoring candidate bullets not already in the master", () => {
    const diff = buildDiff(master, [bank.b9, bank.b1], bank, jd, "AI-in-Singapore summary");
    expect(diff.addBulletIds).toContain("b9");
    expect(diff.addBulletIds).not.toContain("b1"); // already in master
  });

  it("suggests removing master bullets with zero JD relevance", () => {
    const diff = buildDiff(master, [bank.b9], bank, jd, "");
    expect(diff.removeBulletIds).toContain("b3"); // operations: no overlap
    expect(diff.removeBulletIds).not.toContain("b1"); // payments: JD skill
  });

  it("only mirrors keywords that are evidenced in the bullet bank (honesty rule)", () => {
    const diff = buildDiff(master, [bank.b9], bank, jd, "");
    // "genai" appears in no bullet skill/text; "quantum teleportation" neither
    expect(diff.keywordsToMirror).toEqual([]);
  });

  it("mirrors an evidenced keyword", () => {
    const withGenai = {
      ...bank,
      b9: { ...bank.b9, text: "Shipped GenAI feature to 2M users" },
    };
    const diff = buildDiff(master, [withGenai.b9], withGenai, jd, "");
    expect(diff.keywordsToMirror).toEqual(["genai"]);
  });

  it("writes a summary line mentioning the company", () => {
    const diff = buildDiff(master, [bank.b9], bank, jd, "");
    expect(diff.summaryLine.toLowerCase()).toContain("grab");
  });
});

describe("applyDiff", () => {
  it("produces the application CV: master order kept, removals out, additions appended", () => {
    const diff = buildDiff(master, [bank.b9], bank, jd, "");
    const cv = applyDiff(master, diff);
    expect(cv.bulletIds[0]).toBe("b1");
    expect(cv.bulletIds).toContain("b9");
    expect(cv.bulletIds).not.toContain("b3");
    expect(cv.baseMasterVersion).toBe(1);
  });
});
