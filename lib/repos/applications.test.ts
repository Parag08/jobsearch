import { describe, it, expect } from "vitest";
import type { Application } from "../types";
import { FakeDb } from "./fake-db";
import {
  getApplication,
  insertApplication,
  listApplications,
  updateApplication,
  type NewApplication,
} from "./applications";

const base: NewApplication = {
  company: "Grab",
  role: "Senior PM",
  sectorId: null,
  stage: "saved",
  closedReason: null,
  jdExtract: null,
  cvVersionId: null,
  referralContactId: null,
  nextAction: "tailor CV",
  savedAt: "2026-08-29",
  appliedAt: null,
  updatedAt: "2026-08-29T00:00:00Z",
};

describe("applications repo", () => {
  it("insertApplication stores jd_raw for audit but the domain object never carries it", async () => {
    const db = new FakeDb();
    const app = await insertApplication(db, "u1", base, "full raw JD text ...");
    expect(app.id).toBeTruthy();
    expect(app.company).toBe("Grab");
    expect("jdRaw" in app).toBe(false);
    expect(db.rows("applications")[0]?.jd_raw).toBe("full raw JD text ...");
  });

  it("getApplication round-trips; null when missing or another user's", async () => {
    const db = new FakeDb();
    const app = await insertApplication(db, "u1", base);
    expect((await getApplication(db, "u1", app.id))?.role).toBe("Senior PM");
    expect(await getApplication(db, "u1", "missing")).toBeNull();
    expect(await getApplication(db, "u2", app.id)).toBeNull();
  });

  it("updateApplication persists a stage change", async () => {
    const db = new FakeDb();
    const app = await insertApplication(db, "u1", base);
    const advanced: Application = {
      ...app,
      stage: "applied",
      appliedAt: "2026-08-30",
      updatedAt: "2026-08-30T00:00:00Z",
    };
    await updateApplication(db, "u1", advanced);
    const reread = await getApplication(db, "u1", app.id);
    expect(reread?.stage).toBe("applied");
    expect(reread?.appliedAt).toBe("2026-08-30");
  });

  it("listApplications returns only the user's rows, most recently updated first", async () => {
    const db = new FakeDb();
    await insertApplication(db, "u1", { ...base, company: "Old", updatedAt: "2026-08-01T00:00:00Z" });
    await insertApplication(db, "u1", { ...base, company: "New", updatedAt: "2026-08-28T00:00:00Z" });
    await insertApplication(db, "u2", { ...base, company: "Other" });
    const apps = await listApplications(db, "u1");
    expect(apps.map((a) => a.company)).toEqual(["New", "Old"]);
  });
});
