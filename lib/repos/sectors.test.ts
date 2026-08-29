import { describe, it, expect } from "vitest";
import { findOrCreateNode, mergeJdExtract } from "../sector-graph";
import type { JdExtract } from "../types";
import { FakeDb } from "./fake-db";
import { getSectorByPath, listSectors, saveSector } from "./sectors";

const jd: JdExtract = {
  company: "Grab",
  role: "Senior PM, AI",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["roadmap", "llm evals"],
  keywords: ["genai"],
  seniority: "senior",
  visaNote: null,
  location: "Singapore",
};

describe("sectors repo", () => {
  it("saveSector inserts a new node and returns the DB identity (not the domain slug)", async () => {
    const db = new FakeDb();
    const node = findOrCreateNode([], jd.sectorPath);
    mergeJdExtract(node, jd);
    const saved = await saveSector(db, "u1", node);
    expect(saved.id).not.toBe(node.id); // slug id replaced by the generated uuid
    expect(saved.jdCount).toBe(1);
    expect(saved.skills["roadmap"]).toBe(1);
  });

  it("saveSector upserts on (user, path): merging twice keeps one row", async () => {
    const db = new FakeDb();
    const node = findOrCreateNode([], jd.sectorPath);
    mergeJdExtract(node, jd);
    await saveSector(db, "u1", node);
    mergeJdExtract(node, jd);
    const saved = await saveSector(db, "u1", node);
    expect(saved.jdCount).toBe(2);
    expect(await listSectors(db, "u1")).toHaveLength(1);
  });

  it("getSectorByPath round-trips and returns null when absent", async () => {
    const db = new FakeDb();
    const node = findOrCreateNode([], jd.sectorPath);
    mergeJdExtract(node, jd);
    await saveSector(db, "u1", node);
    const found = await getSectorByPath(db, "u1", ["IT", "AI", "Singapore"]);
    expect(found?.jdCount).toBe(1);
    expect(await getSectorByPath(db, "u1", ["IT", "Fintech"])).toBeNull();
    expect(await getSectorByPath(db, "u2", ["IT", "AI", "Singapore"])).toBeNull();
  });
});
