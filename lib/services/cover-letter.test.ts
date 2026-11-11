import { describe, it, expect } from "vitest";
import type { JdExtract } from "../types";
import { FakeDb } from "../repos/fake-db";
import { insertApplicationCv } from "../repos/cvs";
import { getApplication, insertApplication, updateApplication, type NewApplication } from "../repos/applications";
import { getCoverLetter } from "../repos/cover-letters";
import { insertBullets, insertProject } from "../repos/projects";
import { saveProfile } from "../repos/profiles";
import { parseLetterBank } from "../cover-letter";
import { draftCoverLetter, editCoverLetter } from "./cover-letter";

const bank = parseLetterBank({
  signOff: "Yours sincerely,",
  usefulOpener: "It is also where I think I would be useful to you.",
  close: "I would welcome the chance to talk.",
  logistics: "I graduate in December and am available from Spring 2027.",
  spineAnchor: "I am completing my MBA at INSEAD.",
  implementationTriads: ["the roadmap nobody sequenced"],
});

const jd: JdExtract = {
  company: "Bain & Company", role: "Consultant", roleFamily: "consulting", sectorPath: ["Consulting"],
  skills: ["due diligence"], keywords: [], seniority: "mid", visaNote: null, location: "Singapore",
};

const baseApp: NewApplication = {
  company: "Bain & Company", role: "Consultant", sectorId: null, stage: "saved", closedReason: null,
  jdExtract: jd, cvVersionId: null, referralContactId: null, nextAction: null,
  savedAt: "2026-11-01", appliedAt: null, updatedAt: "2026-11-01T00:00:00Z",
};

const reply = [
  "I have spent ten years building software. I am completing my MBA at INSEAD.",
  "I am wary of consulting marketing, so what held my attention was the detail you gave.",
  "It is also where I think I would be useful to you. I graduate in December and am available from Spring 2027. I would welcome the chance to talk.",
].join("\n\n");

async function fixtures() {
  const db = new FakeDb();
  await saveProfile(db, {
    userId: "u1", displayName: "Ada Lovelace", targetGeos: [], roleFamilies: [], targetTitles: [], excludedTitles: [],
    networks: [], visaContext: null, premiumLlmBudgetUsdMonth: 0, contactLines: [], cvExtras: [],
  });
  const p = await insertProject(db, "u1", { name: "Acme - PM", org: "Acme", dates: "2025", role: "PM", narrative: "", outcomes: [], skills: [], sectorTags: [] });
  const [b] = await insertBullets(db, "u1", p.id, [{ roleFamily: "consulting", text: "Sized a fleet cost cut", skills: [] }]);
  const cv = await insertApplicationCv(db, "u1", {
    masterCvId: "m1", diff: { addBulletIds: [b!.id], removeBulletIds: [], keywordsToMirror: [], summaryLine: "S." },
    bulletIds: [b!.id], summaryLine: "S.", filePath: null,
  });
  const app = await insertApplication(db, "u1", baseApp);
  await updateApplication(db, "u1", { ...app, cvVersionId: cv.id });
  return { db, app };
}

const inputs = { firmDetail: "TIG pairs consultants with former operators.", recipient: "", teamName: "TIG Recruitment Team" };

describe("draftCoverLetter", () => {
  it("asks for the firm detail instead of calling the model when it is missing", async () => {
    const { db, app } = await fixtures();
    let called = false;
    const out = await draftCoverLetter({ db, write: async () => ((called = true), reply), bank }, "u1", app.id, { ...inputs, firmDetail: "" }, "2026-11-11");
    expect(out).toEqual({ needs: ["firmDetail"] });
    expect(called).toBe(false);
  });

  it("sends a prompt with the gaps and page bullets, checks the reply, and stores the letter", async () => {
    const { db, app } = await fixtures();
    let prompt = "";
    const out = await draftCoverLetter({ db, write: async (p) => ((prompt = p), reply), bank }, "u1", app.id, inputs, "2026-11-11");
    expect(prompt).toContain("due diligence"); // the honest gap
    expect(prompt).toContain("Sized a fleet cost cut"); // the page's bullet
    if (!("letter" in out)) throw new Error("expected a letter");
    expect(out.letter.paragraphs).toHaveLength(3);
    expect(out.letter.issues).toEqual([]);
    expect(out.text.startsWith("11 November 2026\n\nDear TIG Recruitment Team,")).toBe(true);
    expect(out.text.endsWith("Yours sincerely,\nAda Lovelace")).toBe(true);
    expect((await getCoverLetter(db, "u1", app.id))?.paragraphs).toEqual(out.letter.paragraphs);
  });

  it("stores a reply that breaks the voice rules with its issues listed, for the user to fix", async () => {
    const { db, app } = await fixtures();
    const out = await draftCoverLetter({ db, write: async () => "I'm excited.\n\nWe cut 30%.", bank }, "u1", app.id, inputs, "2026-11-11");
    if (!("letter" in out)) throw new Error("expected a letter");
    expect(out.letter.issues.map((i) => i.kind)).toEqual(expect.arrayContaining(["contraction", "banned-word", "number", "paragraphs"]));
  });

  it("refuses once the application was sent: the letter is frozen with the CV", async () => {
    const { db, app } = await fixtures();
    const current = (await getApplication(db, "u1", app.id))!;
    await updateApplication(db, "u1", { ...current, stage: "applied", appliedAt: "2026-11-05" });
    await expect(draftCoverLetter({ db, write: async () => reply, bank }, "u1", app.id, inputs, "2026-11-11")).rejects.toThrow(/sent|frozen/i);
    await expect(editCoverLetter({ db, bank }, "u1", app.id, reply)).rejects.toThrow(/sent|frozen/i);
  });
});

describe("editCoverLetter", () => {
  it("saves the user's edit and re-runs the checks", async () => {
    const { db, app } = await fixtures();
    await draftCoverLetter({ db, write: async () => reply, bank }, "u1", app.id, inputs, "2026-11-11");
    const edited = await editCoverLetter({ db, bank }, "u1", app.id, reply.replace("I have", "I've"));
    expect(edited.issues.map((i) => i.kind)).toEqual(["contraction"]);
    expect((await getCoverLetter(db, "u1", app.id))?.edited).toBe(true);
  });
});
