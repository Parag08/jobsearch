import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import {
  getApplicationCv,
  getLatestMasterCv,
  insertApplicationCv,
  insertMasterCv,
} from "./cvs";

describe("cvs repo", () => {
  it("getLatestMasterCv returns the highest version for the role family", async () => {
    const db = new FakeDb();
    await insertMasterCv(db, "u1", {
      roleFamily: "product-management",
      summaryLine: "v1",
      bulletIds: ["b1"],
      version: 1,
    });
    await insertMasterCv(db, "u1", {
      roleFamily: "product-management",
      summaryLine: "v2",
      bulletIds: ["b1", "b2"],
      version: 2,
    });
    const latest = await getLatestMasterCv(db, "u1", "product-management");
    expect(latest?.version).toBe(2);
    expect(latest?.summaryLine).toBe("v2");
    expect(await getLatestMasterCv(db, "u1", "data-science")).toBeNull();
  });

  it("insertApplicationCv persists the diff (jsonb) and round-trips", async () => {
    const db = new FakeDb();
    const diff = {
      addBulletIds: ["b9"],
      removeBulletIds: ["b1"],
      keywordsToMirror: ["genai"],
      summaryLine: "Tailored line",
    };
    const stored = await insertApplicationCv(db, "u1", {
      masterCvId: "m1",
      diff,
      bulletIds: ["b9", "b2"],
      summaryLine: "Tailored line",
      filePath: null,
    });
    const reread = await getApplicationCv(db, "u1", stored.id);
    expect(reread?.diff).toEqual(diff);
    expect(reread?.bulletIds).toEqual(["b9", "b2"]);
    expect(await getApplicationCv(db, "u2", stored.id)).toBeNull();
  });
});
