import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import type { Project } from "../types";
import type { Profile, StoredApplicationCv } from "../repos/rows";
import { resolveCv, type ResolvedCv } from "./resolve-cv";
import { renderDocx } from "./docx";
import { renderPdf } from "./pdf";
import { exportFileName } from "./file-name";

const profile: Profile = {
  userId: "u1",
  displayName: "Ada Lovelace",
  targetGeos: [],
  roleFamilies: [],
  targetTitles: [],
  excludedTitles: [],
  networks: [{ name: "INSEAD", program: "MBA", location: "Singapore" }],
  visaContext: null,
  premiumLlmBudgetUsdMonth: 0,
  contactLines: ["ada@example.com", "+65 1000 0000"],
  cvExtras: [
    { id: "add-skills", label: "Skills", text: "Leadership | Product" },
    { id: "junk" },
  ],
};

const project = (id: string, org: string, role: string, bullets: [string, string][]): Project => ({
  id,
  name: `${org} - ${role}`,
  org,
  dates: "2024 - 2026",
  role,
  narrative: `${org} blurb`,
  outcomes: [],
  skills: [],
  sectorTags: [],
  bullets: bullets.map(([bid, text]) => ({
    id: bid,
    projectId: id,
    roleFamily: "product-management",
    text,
    skills: [],
    variants: [{ label: "short", text: `${text} (short)` }],
  })),
});

const projects = [
  project("p1", "Acme", "PM", [["b1", "Shipped the roadmap"], ["b2", "Unused bullet"]]),
  project("p2", "Beta", "Engineer", [["b3", "Built the platform – fast"]]),
  project("p3", "Gamma", "Analyst", [["b4", "Not selected"]]),
  project("p4", "INSEAD", "MBA", []),
];

const cv: StoredApplicationCv = {
  id: "cv1",
  masterCvId: "m1",
  diff: { addBulletIds: [], removeBulletIds: [], keywordsToMirror: [], summaryLine: "PM, targeting AI.", variants: { b3: "short" } },
  bulletIds: ["b3", "b1"],
  summaryLine: "PM, targeting AI.",
  filePath: null,
};

describe("resolveCv", () => {
  it("groups the chosen bullets under their org and role, resolving variants, in bank order", () => {
    const r = resolveCv(cv, projects, profile);
    expect(r.name).toBe("Ada Lovelace");
    expect(r.contactLines).toEqual(["ada@example.com", "+65 1000 0000"]);
    expect(r.summaryLine).toBe("PM, targeting AI.");
    expect(r.experience.map((e) => e.org)).toEqual(["Acme", "Beta"]); // Gamma has no chosen bullet
    expect(r.experience[0]!.roles[0]).toEqual({ title: "PM", dates: "2024 - 2026", bullets: ["Shipped the roadmap"] });
    expect(r.experience[1]!.roles[0]!.bullets).toEqual(["Built the platform – fast (short)"]);
  });

  it("lists education (the profile's networks) even without bullets, and keeps well-formed extras only", () => {
    const r = resolveCv(cv, projects, profile);
    expect(r.education.map((e) => e.org)).toEqual(["INSEAD"]);
    expect(r.extras).toEqual([{ label: "Skills", text: "Leadership | Product" }]);
  });

  it("uses the frozen snapshot once the CV was sent, not today's bank", () => {
    const sent: StoredApplicationCv = {
      ...cv,
      sentSnapshot: { bullets: [{ bulletId: "b1", text: "What was actually sent" }], summaryLine: "Sent summary." },
    };
    const r = resolveCv(sent, projects, profile);
    expect(r.summaryLine).toBe("Sent summary.");
    expect(r.experience.flatMap((e) => e.roles.flatMap((x) => x.bullets))).toEqual(["What was actually sent"]);
  });
});

const resolved: ResolvedCv = resolveCv(cv, projects, profile);

describe("renderDocx", () => {
  it("produces a Word document carrying the name, summary and every bullet", async () => {
    const bytes = await renderDocx(resolved);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK"); // a zip container
    const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string");
    for (const t of ["Ada Lovelace", "PM, targeting AI.", "Shipped the roadmap", "Acme", "INSEAD", "Leadership | Product"]) {
      expect(xml).toContain(t);
    }
  });
});

describe("renderPdf", () => {
  it("produces a one-page PDF for a normal CV, without choking on typographic characters", async () => {
    const bytes = await renderPdf(resolved);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Ada Lovelace - CV");
  });

  it("flows onto a second page rather than clipping text when the CV is long", async () => {
    const long: ResolvedCv = {
      ...resolved,
      experience: [{ org: "Acme", blurb: "", roles: [{ title: "PM", dates: "", bullets: Array(90).fill("A bullet line") }] }],
    };
    const doc = await PDFDocument.load(await renderPdf(long));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});

describe("exportFileName", () => {
  it("names the file after the person and company, safe for any filesystem", () => {
    expect(exportFileName("Ada Lovelace", "Bain & Company", "pdf")).toBe("Ada-Lovelace-CV-Bain-Company.pdf");
    expect(exportFileName("Ada", "", "docx")).toBe("Ada-CV.docx");
  });
});

describe("letter export", () => {
  const letter = "11 November 2026\n\nDear Team,\n\nFirst paragraph – here.\n\nSecond.\n\nThird.\n\nYours sincerely,\nAda Lovelace";
  it("renders the letter as DOCX keeping every block", async () => {
    const { renderLetterDocx } = await import("./letter");
    const xml = await (await JSZip.loadAsync(await renderLetterDocx(letter, "Ada Lovelace"))).file("word/document.xml")!.async("string");
    for (const t of ["11 November 2026", "Dear Team,", "Third.", "Yours sincerely,", "Ada Lovelace"]) expect(xml).toContain(t);
  });
  it("renders the letter as a one-page PDF", async () => {
    const { renderLetterPdf } = await import("./letter");
    const doc = await PDFDocument.load(await renderLetterPdf(letter, "Ada Lovelace"));
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Ada Lovelace - Cover letter");
  });
});
