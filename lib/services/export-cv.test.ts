import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { getApplicationCv, insertApplicationCv } from "../repos/cvs";
import { insertApplication, updateApplication, type NewApplication } from "../repos/applications";
import { insertBullets, insertProject } from "../repos/projects";
import { saveProfile } from "../repos/profiles";
import { FakeFileStore } from "../export/file-store";
import { exportCv } from "./export-cv";

const baseApp: NewApplication = {
  company: "Bain & Company",
  role: "Consultant",
  sectorId: null,
  stage: "saved",
  closedReason: null,
  jdExtract: null,
  cvVersionId: null,
  referralContactId: null,
  nextAction: null,
  savedAt: "2026-11-01",
  appliedAt: null,
  updatedAt: "2026-11-01T00:00:00Z",
};

async function fixtures() {
  const db = new FakeDb();
  await saveProfile(db, {
    userId: "u1", displayName: "Ada Lovelace", targetGeos: [], roleFamilies: [], targetTitles: [], excludedTitles: [],
    networks: [], visaContext: null, premiumLlmBudgetUsdMonth: 0, contactLines: ["ada@example.com"], cvExtras: [],
  });
  const p = await insertProject(db, "u1", { name: "Acme - PM", org: "Acme", dates: "2025", role: "PM", narrative: "", outcomes: [], skills: [], sectorTags: [] });
  const [b] = await insertBullets(db, "u1", p.id, [{ roleFamily: "consulting", text: "Sized a 30% cost cut", skills: [] }]);
  const cv = await insertApplicationCv(db, "u1", {
    masterCvId: "m1",
    diff: { addBulletIds: [b!.id], removeBulletIds: [], keywordsToMirror: [], summaryLine: "Consultant." },
    bulletIds: [b!.id],
    summaryLine: "Consultant.",
    filePath: null,
  });
  const app = await insertApplication(db, "u1", baseApp);
  await updateApplication(db, "u1", { ...app, cvVersionId: cv.id });
  return { db, app, cv };
}

describe("exportCv", () => {
  it("renders the PDF, stores it under the user's folder, and records the path on the CV", async () => {
    const { db, app, cv } = await fixtures();
    const files = new FakeFileStore();
    const out = await exportCv({ db, files }, "u1", app.id, "pdf");
    expect(out.fileName).toBe("Ada-Lovelace-CV-Bain-Company.pdf");
    expect(out.contentType).toBe("application/pdf");
    expect(new TextDecoder().decode(out.bytes.slice(0, 5))).toBe("%PDF-");
    expect(out.filePath).toBe(`u1/${app.id}/${cv.id}.pdf`);
    expect(files.files.get(out.filePath!)?.contentType).toBe("application/pdf");
    expect((await getApplicationCv(db, "u1", cv.id))?.filePath).toBe(out.filePath);
  });

  it("renders DOCX with the Word content type", async () => {
    const { db, app } = await fixtures();
    const out = await exportCv({ db, files: new FakeFileStore() }, "u1", app.id, "docx");
    expect(out.contentType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(out.fileName.endsWith(".docx")).toBe(true);
  });

  it("without a file store (demo) it still returns the file, and stores nothing", async () => {
    const { db, app, cv } = await fixtures();
    const out = await exportCv({ db, files: null }, "u1", app.id, "pdf");
    expect(out.filePath).toBeNull();
    expect((await getApplicationCv(db, "u1", cv.id))?.filePath).toBeNull();
  });

  it("a storage failure never blocks the download", async () => {
    const { db, app } = await fixtures();
    const out = await exportCv({ db, files: new FakeFileStore("bucket missing") }, "u1", app.id, "pdf");
    expect(out.bytes.length).toBeGreaterThan(0);
    expect(out.filePath).toBeNull();
    expect(out.storageError).toMatch(/bucket missing/);
  });

  it("fails clearly when there is no tailored CV yet", async () => {
    const db = new FakeDb();
    const app = await insertApplication(db, "u1", baseApp);
    await expect(exportCv({ db, files: null }, "u1", app.id, "pdf")).rejects.toThrow(/tailor/i);
  });
});

describe("exportLetter", () => {
  it("fails clearly when there is no letter yet", async () => {
    const { exportLetter } = await import("./export-cv");
    const { parseLetterBank } = await import("../cover-letter");
    const bank = parseLetterBank({ signOff: "Yours sincerely,", usefulOpener: "u", close: "c", logistics: "l", spineAnchor: "s", implementationTriads: ["t"] });
    const db = new FakeDb();
    const app = await insertApplication(db, "u1", baseApp);
    await expect(exportLetter({ db, files: null, bank }, "u1", app.id, "pdf")).rejects.toThrow(/draft one first/);
  });
});
