import { describe, it, expect } from "vitest";
import ownerBankJson from "@/data/cvbuilder/letter-bank.json";
import { letterBankFor } from "./bank";
import { parseLetterBank } from "./index";
import { freshVisitorDb, DEMO_USER_ID } from "../db/demo";
import { listApplications } from "../repos/applications";
import { cannedText } from "../demo/canned";
import { draftCoverLetter, editCoverLetter, letterText } from "../services/cover-letter";
import { exportLetter } from "../services/export-cv";
import JSZip from "jszip";

const ownerBank = parseLetterBank(ownerBankJson);
const ownerStrings = [
  ownerBank.signOff,
  ownerBank.spineAnchor,
  ownerBank.usefulOpener,
  ownerBank.logistics,
  ownerBank.close,
  ...ownerBank.implementationTriads,
  "INSEAD",
];

function expectNoOwnerText(text: string) {
  for (const s of ownerStrings) expect(text, `demo text contains "${s}"`).not.toContain(s);
}

describe("letterBankFor", () => {
  it("gives live workspaces the owner's bank", () => {
    expect(letterBankFor({ mode: "live" })).toEqual(ownerBank);
  });

  it("gives the demo a bank sharing none of the owner's strings", () => {
    expectNoOwnerText(JSON.stringify(letterBankFor({ mode: "demo" })));
  });

  it("keeps the owner's text out of a demo visitor's drafted, edited and exported letter", async () => {
    const db = freshVisitorDb("2026-11-19");
    const bank = letterBankFor({ mode: "demo" });
    const app = (await listApplications(db, DEMO_USER_ID)).find((a) => a.jdExtract && !a.appliedAt);
    expect(app).toBeDefined();
    const inputs = { firmDetail: "The team reviews every launch with support first.", recipient: "", teamName: "" };
    const write = async () => cannedText("cover-letter", {});

    const result = await draftCoverLetter({ db, write, bank }, DEMO_USER_ID, app!.id, inputs, "2026-11-19");
    if ("needs" in result) throw new Error("expected a drafted letter");
    expectNoOwnerText(result.text);

    await editCoverLetter({ db, bank }, DEMO_USER_ID, app!.id, result.letter.paragraphs.join("\n\n"));
    expectNoOwnerText(letterText(result.letter, bank, "Maya Okafor"));

    const out = await exportLetter({ db, files: null, bank }, DEMO_USER_ID, app!.id, "docx");
    const xml = await (await JSZip.loadAsync(out.bytes)).file("word/document.xml")!.async("string");
    expect(xml).toContain(bank.signOff);
    expectNoOwnerText(xml);
  });
});
