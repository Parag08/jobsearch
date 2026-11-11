import { describe, it, expect } from "vitest";
import type { JdExtract } from "../types";
import { FakeDb } from "../repos/fake-db";
import { getApplication, insertApplication, type NewApplication } from "../repos/applications";
import { insertMasterCv } from "../repos/cvs";
import { insertBullets, insertProject } from "../repos/projects";
import { saveProfile } from "../repos/profiles";
import type { Profile } from "../repos/rows";
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

  it("with no master for the JD's role family, tailors from the master that best fits the JD instead of failing", async () => {
    const { db, bullets } = await fixtures();
    const other = await insertMasterCv(db, "u1", {
      roleFamily: "consulting",
      summaryLine: "Consultant.",
      bulletIds: [bullets[2]!.id], // scores zero against the JD
      version: 1,
    });
    const best = await insertMasterCv(db, "u1", {
      roleFamily: "general",
      summaryLine: "Builder.",
      bulletIds: [bullets[0]!.id, bullets[1]!.id],
      version: 1,
    });
    const app = await insertApplication(db, "u1", { ...baseApp, jdExtract: { ...jd, roleFamily: "account-management" } });
    const { cv } = await tailorCv({ db }, "u1", app.id, NOW);
    expect(cv.masterCvId).toBe(best.id);
    expect(cv.masterCvId).not.toBe(other.id);
  });

  it("scores by the JD's tag demand through the user's taxonomy, so a bullet that says it differently still wins", async () => {
    const { db, master, bullets } = await fixtures();
    await saveProfile(db, { ...profileWith({}), taxonomy: { tags: { "product-management": ["roadmap", "product strategy"] } } });
    // the extract names "product strategy"; only the taxonomy links it to the bullet's tag
    const ext: JdExtract = { ...jd, skills: [], keywords: [] };
    const app = await insertApplication(db, "u1", { ...baseApp, jdExtract: ext }, "We need someone to own product strategy.");
    const tagged = bullets[1]!; // "Ran llm evals" - not in the master; tag it product-management
    await db.from("bullets").update({ skills: ["product-management"] }).eq("id", tagged.id);
    const { cv, application } = await tailorCv({ db }, "u1", app.id, NOW);
    expect(cv.bulletIds).toContain(tagged.id);
    // signals computed once from the stored posting and kept on the extract
    expect(application.jdExtract?.signals?.demand["product-management"]).toBeDefined();
    void master;
  });

  it("applies the per-org cap from profile data: no org outweighs its cap, best-scoring kept", async () => {
    const { db, app, bullets } = await fixtures();
    await saveProfile(db, profileWith({ AI71: 1 }));
    const { cv, diff } = await tailorCv({ db }, "u1", app.id, NOW);
    const ai71 = cv.bulletIds.filter((id) => bullets.slice(0, 2).some((b) => b.id === id));
    expect(ai71).toHaveLength(1);
    expect(ai71[0]).toBe(bullets[0]!.id); // the higher-scoring one survives the cap
    const capped = diff.editorial?.decisions.find((d) => d.kind === "capped");
    expect(capped?.reason).toMatch(/AI71 cap of 1/);
  });

  it("with no caps in the profile, nothing is capped", async () => {
    const { db, app, bullets } = await fixtures();
    const { cv } = await tailorCv({ db }, "u1", app.id, NOW);
    expect(cv.bulletIds).toEqual(expect.arrayContaining([bullets[0]!.id, bullets[1]!.id]));
  });

  it("when the page runs long it takes a short variant before cutting a bullet, and records why", async () => {
    const { db, app } = await longFixtures();
    // 56-line budget: 53 overhead + 1 summary leaves 2 lines; the long bullet needs 2 on its own.
    const page = { pageSize: "A4" as const, scale: 1, overheadLines: 53 };
    const { cv, diff } = await tailorCv({ db, page }, "u1", app.id, NOW);
    expect(diff.editorial?.actions.some((a) => a.kind === "short-variant")).toBe(true);
    expect(diff.editorial?.actions.some((a) => a.kind === "drop")).toBe(false);
    expect(cv.bulletIds).toHaveLength(2);
    expect(Object.values(diff.variants ?? {})).toContain("short");
    expect(diff.editorial?.fit?.overflow).toBe(0);
  });

  it("without page settings it records no fit and drops nothing for space", async () => {
    const { db, app } = await longFixtures();
    const { diff } = await tailorCv({ db }, "u1", app.id, NOW);
    expect(diff.editorial?.fit).toBeNull();
    expect(diff.editorial?.actions).toEqual([]);
  });
});

function profileWith(orgCaps: Record<string, number>): Profile {
  return {
    userId: "u1",
    displayName: "P",
    targetGeos: [],
    roleFamilies: [],
    targetTitles: [],
    excludedTitles: [],
    networks: [],
    visaContext: null,
    premiumLlmBudgetUsdMonth: 0,
    contactLines: [],
    cvExtras: [],
    orgCaps,
  };
}

/** Two relevant bullets, one long (two lines at A4/1) with a one-line short variant. */
async function longFixtures() {
  const db = new FakeDb();
  const project = await insertProject(db, "u1", {
    name: "GenAI Platform", org: "AI71", dates: "2025", role: "PM", narrative: "", outcomes: [], skills: [], sectorTags: [],
  });
  const long = "Owned the genai roadmap end to end across four product lines, aligning engineering, design and go-to-market teams on one plan";
  const bullets = await insertBullets(db, "u1", project.id, [
    { roleFamily: "product-management", text: long, skills: ["roadmap", "genai"], variants: [{ label: "short", text: "Owned the genai roadmap end to end" }] },
    { roleFamily: "product-management", text: "Ran llm evals for launch quality", skills: ["llm evals"] },
  ]);
  await insertMasterCv(db, "u1", { roleFamily: "product-management", summaryLine: "PM.", bulletIds: [], version: 1 });
  const app = await insertApplication(db, "u1", baseApp);
  return { db, app, bullets };
}
