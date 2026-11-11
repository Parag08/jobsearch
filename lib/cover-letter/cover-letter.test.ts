import { describe, it, expect } from "vitest";
import type { Contact, JdExtract } from "../types";
import {
  assembleLetter,
  buildCoverLetterPrompt,
  buildLetterBrief,
  checkLetter,
  letterDate,
  parseLetterBank,
  pickVariant,
  splitParagraphs,
  type LetterBank,
} from ".";

const bank: LetterBank = parseLetterBank({
  signOff: "Yours sincerely,",
  usefulOpener: "It is also where I think I would be useful to you.",
  close: "I would welcome the chance to talk, and thank you for your time and consideration.",
  logistics: "I graduate in December and am available from Spring 2027.",
  spineAnchor: "I am completing my MBA at INSEAD.",
  implementationTriads: [
    "the roadmap nobody sequenced, the process that quietly assumed a team twice the size, the change that was announced rather than adopted",
    "the process that quietly assumed a team twice the size, the tool nobody adopted because nobody asked the people who would use it",
  ],
});

const jd: JdExtract = {
  company: "Bain & Company",
  role: "Consultant, TIG",
  roleFamily: "consulting",
  sectorPath: ["Consulting"],
  skills: ["due diligence", "sql"],
  keywords: ["private equity"],
  seniority: "mid",
  visaNote: null,
  location: "Singapore",
};

const contact = (over: Partial<Contact>): Contact => ({
  id: "c",
  name: "Mallika Gokarn",
  network: null,
  company: "Bain & Company",
  role: "Manager",
  location: null,
  warmth: "warm",
  status: "met",
  interests: [],
  interactions: [],
  nextFollowup: null,
  ...over,
});

describe("buildLetterBrief", () => {
  const base = {
    jd,
    gaps: [{ term: "due diligence", kind: "skill" as const }],
    cvBullets: ["Sized a 30% fleet cost cut for the CEO", "Led a team of 8 engineers"],
    contacts: [contact({}), contact({ id: "x", name: "Cold Person", status: "not-contacted" }), contact({ id: "y", name: "Elsewhere", company: "BCG" })],
    bank,
    applicantName: "Ada Lovelace",
  };

  it("refuses to proceed without the firm's specific detail: it asks rather than invents", () => {
    expect(buildLetterBrief({ ...base, firmDetail: "  " })).toEqual({ needs: ["firmDetail"] });
  });

  it("carries the gaps, the page's bullets, the firm detail, and only contacts with a real conversation", () => {
    const b = buildLetterBrief({ ...base, firmDetail: "TIG pairs consultants with former operators." });
    if ("needs" in b) throw new Error("expected a brief");
    expect(b.gaps).toEqual(["due diligence"]);
    expect(b.firmDetail).toBe("TIG pairs consultants with former operators.");
    expect(b.namedContacts).toEqual(["Mallika Gokarn (Manager)"]);
    expect(b.cvBullets).toHaveLength(2);
    expect(bank.implementationTriads).toContain(b.implementationTriad);
  });
});

describe("pickVariant", () => {
  it("is deterministic per company, so a regenerated letter keeps the same argument", () => {
    expect(pickVariant(["a", "b", "c"], "Bain & Company")).toBe(pickVariant(["a", "b", "c"], "Bain & Company"));
    expect(pickVariant([], "x")).toBe("");
  });
});

describe("buildCoverLetterPrompt", () => {
  it("asks for exactly three paragraphs, states the voice rules, and never sends a raw document", () => {
    const b = buildLetterBrief({
      jd, gaps: [{ term: "due diligence", kind: "skill" }], cvBullets: ["Sized a cost cut"], contacts: [],
      firmDetail: "TIG pairs consultants with former operators.", bank, applicantName: "Ada",
    });
    if ("needs" in b) throw new Error("expected a brief");
    const p = buildCoverLetterPrompt(b);
    expect(p).toMatch(/exactly three paragraphs/i);
    expect(p).toMatch(/no contractions/i);
    expect(p).toMatch(/British spelling/i);
    expect(p).toContain("TIG pairs consultants with former operators.");
    expect(p).toContain("due diligence");
    expect(p).toContain(bank.usefulOpener);
    expect(p).toMatch(/do not state any fact about the firm/i);
  });
});

const good = [
  "I have spent more than ten years building software, most recently leading a team at a cloud company. I am completing my MBA at INSEAD.",
  "I have read enough consulting marketing to be wary of it, so what held my attention was that TIG pairs consultants with former operators. That is what draws me to TIG in particular.",
  "It is also where I think I would be useful to you. I graduate in December and am available from Spring 2027. I would welcome the chance to talk, and thank you for your time and consideration.",
].join("\n\n");

describe("checkLetter", () => {
  it("passes a letter that keeps the voice rules", () => {
    expect(checkLetter(good, { allowedText: bank.logistics }).issues).toEqual([]);
  });

  it("flags contractions, enthusiasm words, the wrong paragraph count, and numbers nobody supplied", () => {
    const bad = "I'm passionate about this.\n\nWe cut cost by 30%.";
    const kinds = checkLetter(bad, { allowedText: bank.logistics }).issues.map((i) => i.kind).sort();
    expect(kinds).toEqual(["banned-word", "contraction", "number", "paragraphs"].sort());
  });

  it("allows numbers that appear in the supplied text (logistics, firm detail)", () => {
    const text = good.replace("Spring 2027", "Spring 2027 and from 1 February");
    expect(checkLetter(text, { allowedText: `${bank.logistics} starts 1 February` }).issues).toEqual([]);
  });
});

describe("splitParagraphs / assembleLetter / letterDate", () => {
  it("splits on blank lines and trims, dropping a salutation or sign-off the model added anyway", () => {
    const withExtras = `Dear Team,\n\n${good}\n\nYours sincerely,\nAda`;
    expect(splitParagraphs(withExtras)).toHaveLength(3);
  });

  it("assembles date, salutation, the three paragraphs and the fixed close", () => {
    const text = assembleLetter({
      date: "7 September 2026",
      recipient: "",
      teamName: "Tech Insights Group Recruitment Team",
      paragraphs: splitParagraphs(good),
      bank,
      applicantName: "Ada Lovelace",
    });
    expect(text.startsWith("7 September 2026\n\nDear Tech Insights Group Recruitment Team,\n\n")).toBe(true);
    expect(text.endsWith("Yours sincerely,\nAda Lovelace")).toBe(true);
    expect(assembleLetter({ date: "d", recipient: "Ms Gokarn", teamName: "x", paragraphs: ["p"], bank, applicantName: "A" })).toContain("Dear Ms Gokarn,");
  });

  it("formats the date the way the sent letters do", () => {
    expect(letterDate("2026-09-07")).toBe("7 September 2026");
  });
});

describe("checkLetter length", () => {
  it("checks the word range only when the bank sets one", () => {
    expect(checkLetter(good, { allowedText: bank.logistics, wordRange: [300, 450] }).issues.map((i) => i.kind)).toEqual(["length"]);
  });
});
