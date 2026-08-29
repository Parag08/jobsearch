import { describe, it, expect } from "vitest";
import type { JdExtract } from "../types";
import { FakeDb } from "../repos/fake-db";
import { getApplication, insertApplication, type NewApplication } from "../repos/applications";
import { insertMasterCv } from "../repos/cvs";
import { insertBullets, insertProject } from "../repos/projects";
import { tailorCv } from "./tailor-cv";

const jd: JdExtract = {
  company: "Grab",
  role: "Senior PM, AI",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["roadmap", "llm evals"],
  keywords: ["genai", "quantum computing"],
  seniority: "senior",
  visaNote: null,
  location: "Singapore",
};

const NOW = "2026-08-30T09:00:00Z";

const baseApp: NewApplication = {
  company: "Grab",
  role: "Senior PM, AI",
  sectorId: null,
  stage: "saved",
  closedReason: null,
  jdExtract: jd,
  cvVersionId: null,
  referralContactId: null,
  nextAction: null,
  savedAt: "2026-08-29",
  appliedAt: null,
  updatedAt: "2026-08-29T00:00:00Z",
};

async function fixtures() {
  const db = new FakeDb();
  const project = await insertProject(db, "u1", {
    name: "GenAI Platform",
    org: "AI71",
    dates: "2025",
    role: "PM",
    narrative: "",
    outcomes: [],
    skills: ["roadmap"],
    sectorTags: [],
  });
  const bullets = await insertBullets(db, "u1", project.id, [
    { roleFamily: "product-management", text: "Owned the genai roadmap end to end", skills: ["roadmap", "genai"] },
    { roleFamily: "product-management", text: "Ran llm evals for launch quality", skills: ["llm evals"] },
    { roleFamily: "product-management", text: "Unrelated ops work", skills: ["logistics"] },
  ]);
  const master = await insertMasterCv(db, "u1", {
    roleFamily: "product-management",
    summaryLine: "Product manager building AI products.",
    bulletIds: [bullets[2]!.id], // master currently leads with the irrelevant bullet
    version: 1,
  });
  const app = await insertApplication(db, "u1", baseApp);
  return { db, app, master, bullets };
}

describe("tailorCv", () => {
  it("builds a diff from the master, persists the tailored CV, and links it to the application", async () => {
    const { db, app, master, bullets } = await fixtures();
    const { cv, diff, application } = await tailorCv({ db }, "u1", app.id, NOW);

    expect(cv.masterCvId).toBe(master.id);
    expect(diff.addBulletIds).toContain(bullets[0]!.id);
    expect(diff.removeBulletIds).toContain(bullets[2]!.id); // zero-score bullet dropped
    expect(diff.keywordsToMirror).toContain("genai"); // evidenced in the bank
    expect(diff.keywordsToMirror).not.toContain("quantum computing"); // honesty rule
    expect(application.cvVersionId).toBe(cv.id);
    expect(application.updatedAt).toBe(NOW);
    expect((await getApplication(db, "u1", app.id))?.cvVersionId).toBe(cv.id);
  });

  it("fails clearly when the application, extract, or master CV is missing", async () => {
    const { db, app } = await fixtures();
    await expect(tailorCv({ db }, "u1", "missing", NOW)).rejects.toThrow(/application/i);

    const noExtract = await insertApplication(db, "u1", { ...baseApp, jdExtract: null });
    await expect(tailorCv({ db }, "u1", noExtract.id, NOW)).rejects.toThrow(/extract/i);

    const dbEmpty = new FakeDb();
    const orphan = await insertApplication(dbEmpty, "u1", baseApp);
    await expect(tailorCv({ db: dbEmpty }, "u1", orphan.id, NOW)).rejects.toThrow(/master/i);
    void app;
  });
});
