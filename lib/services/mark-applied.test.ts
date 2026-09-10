import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { markApplied } from "./mark-applied";
import { snapshotCv } from "../freeze";
import type { Bullet } from "../types";

const USER = "user-1";

function seedWorkspace(db: FakeDb) {
  db.seed("projects", [{ id: "p1", user_id: USER, name: "P1", org: "Org A", dates: null, role: null, narrative: "", outcomes: [], skills: [], sector_tags: [] }]);
  db.seed("bullets", [
    { id: "b1", user_id: USER, project_id: "p1", role_family: "general", text: "Long form bullet one", skills: [], variants: [{ label: "short", text: "Short one" }], strength: 3 },
    { id: "b2", user_id: USER, project_id: "p1", role_family: "general", text: "Bullet two", skills: [], variants: [], strength: 3 },
  ]);
  db.seed("master_cvs", [{ id: "m1", user_id: USER, role_family: "general", summary_line: "Summary", bullet_ids: ["b1", "b2"], version: 1 }]);
  db.seed("application_cvs", [
    {
      id: "cv1",
      user_id: USER,
      master_cv_id: "m1",
      diff: { addBulletIds: [], removeBulletIds: [], keywordsToMirror: [], summaryLine: "Tailored summary", variants: { b1: "short" } },
      bullet_ids: ["b1", "b2"],
      summary_line: "Tailored summary",
      file_path: null,
    },
  ]);
  db.seed("applications", [
    {
      id: "a1",
      user_id: USER,
      company: "Acme",
      role: "PM",
      sector_id: null,
      stage: "saved",
      closed_reason: null,
      jd_extract: null,
      jd_raw: null,
      cv_id: "cv1",
      referral_contact_id: null,
      next_action: null,
      saved_at: "2026-09-01",
      applied_at: null,
      updated_at: "2026-09-01",
    },
  ]);
}

describe("snapshotCv", () => {
  it("resolves each bullet's text as sent (override > variant > base) in page order", () => {
    const bank: Record<string, Bullet> = {
      b1: { id: "b1", projectId: "p1", roleFamily: "general", text: "Long", skills: [], variants: [{ label: "short", text: "Short" }] },
      b2: { id: "b2", projectId: "p1", roleFamily: "general", text: "Two", skills: [] },
    };
    const snap = snapshotCv(
      { id: "cv", masterCvId: "m", bulletIds: ["b2", "b1"], summaryLine: "S", filePath: null, diff: { addBulletIds: [], removeBulletIds: [], keywordsToMirror: [], summaryLine: "S", variants: { b1: "short" } } },
      bank,
    );
    expect(snap.bullets).toEqual([
      { bulletId: "b2", text: "Two" },
      { bulletId: "b1", text: "Short" },
    ]);
    expect(snap.summaryLine).toBe("S");
  });

  it("keeps a placeholder for a bullet the bank no longer has, rather than dropping it silently", () => {
    const snap = snapshotCv(
      { id: "cv", masterCvId: "m", bulletIds: ["gone"], summaryLine: "S", filePath: null, diff: { addBulletIds: [], removeBulletIds: [], keywordsToMirror: [], summaryLine: "S" } },
      {},
    );
    expect(snap.bullets[0]).toEqual({ bulletId: "gone", text: null });
  });
});

describe("markApplied", () => {
  it("advances to applied, stamps appliedAt, and freezes the sent CV exactly once", async () => {
    const db = new FakeDb();
    seedWorkspace(db);

    const res = await markApplied({ db }, USER, "a1", "2026-09-10T08:00:00Z");
    expect(res.application.stage).toBe("applied");
    expect(res.application.appliedAt).toBe("2026-09-10");
    expect(res.frozen).toBe(true);

    const cv = db.rows("application_cvs")[0];
    expect(cv.sent_at).toBe("2026-09-10T08:00:00Z");
    expect(cv.sent_snapshot?.bullets).toEqual([
      { bulletId: "b1", text: "Short one" },
      { bulletId: "b2", text: "Bullet two" },
    ]);
    expect(cv.sent_snapshot?.summaryLine).toBe("Tailored summary");
  });

  it("does not overwrite an existing snapshot on a second pass through applied", async () => {
    const db = new FakeDb();
    seedWorkspace(db);
    await markApplied({ db }, USER, "a1", "2026-09-10T08:00:00Z");
    // bank edited after send - the snapshot must still describe what was sent
    const b1 = db.rows("bullets")[0];
    await db.from("bullets").update({ text: "REWRITTEN" }).eq("id", b1.id);
    const app = db.rows("applications")[0];
    await db.from("applications").update({ stage: "screening" }).eq("id", app.id);

    const res = await markApplied({ db }, USER, "a1", "2026-09-12T08:00:00Z");
    expect(res.frozen).toBe(false);
    expect(res.application.appliedAt).toBe("2026-09-10");
    const cv = db.rows("application_cvs")[0];
    expect(cv.sent_at).toBe("2026-09-10T08:00:00Z");
    expect(cv.sent_snapshot?.bullets[0].text).toBe("Short one");
  });

  it("applies without a CV too - the transition is never blocked, frozen is just false", async () => {
    const db = new FakeDb();
    seedWorkspace(db);
    const app = db.rows("applications")[0];
    await db.from("applications").update({ cv_id: null }).eq("id", app.id);
    const res = await markApplied({ db }, USER, "a1", "2026-09-10T08:00:00Z");
    expect(res.application.stage).toBe("applied");
    expect(res.frozen).toBe(false);
  });
});
