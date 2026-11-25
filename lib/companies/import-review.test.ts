import { describe, expect, it } from "vitest";
import { analyzeImport, mapImportRows, suggestImportColumns, type ImportCompany, type ImportSheet } from "./import-review";

const companies: ImportCompany[] = [
  { id: "stripe", name: "Stripe", identity: "stripe", website: "https://stripe.com", active: true },
  { id: "wise", name: "Wise", identity: "wise", website: "https://wise.com", active: false },
];
const row = (number: number, name: string, website = "", formula = false) => ({ number, name, website, formula });

describe("import mapping", () => {
  it("suggests unambiguous columns, keeps nonempty unmapped rows and preserves file row numbers", () => {
    const sheet: ImportSheet = { name: "Targets", rows: [
      { number: 2, cells: { 0: { text: "Employer" }, 1: { text: "Company site" }, 2: { text: "Notes" } } },
      { number: 4, cells: { 0: { text: "Acme" }, 1: { text: "acme.com", formula: true } } },
      { number: 9, cells: { 2: { text: "Ignored" } } },
    ] };
    expect(suggestImportColumns(sheet, 2, true)).toEqual({ name: 0, website: 1 });
    expect(suggestImportColumns(sheet, 2, false)).toEqual({ name: null, website: null });
    expect(mapImportRows(sheet, { start: 2, headers: true, name: 0, website: 1 })).toEqual([
      row(4, "Acme", "acme.com", true), row(9, ""),
    ]);
    expect(mapImportRows(sheet, { start: 2, headers: true, name: 0, website: 0 })).toBeNull();
  });
});

describe("import identity review", () => {
  it("keeps existing targets, re-adds inactive companies without overwriting, and promotes repeats after a skip", () => {
    const rows = [row(2, " stripe "), row(3, "Wise", "http://www.wise.com/about"), row(4, "WISE"), row(5, "Acme")];
    expect(analyzeImport(rows, companies).map((r) => r.kind)).toEqual(["existing", "readd", "repeated", "new"]);
    expect(analyzeImport(rows, companies, { 3: { skip: true } }).map((r) => r.kind)).toEqual(["existing", "skipped", "readd", "new"]);
  });

  it("offers scoped explicit matches without changing canonical details", () => {
    const rows = [row(2, "Stripe", "wise.com"), row(3, "Wise Payments", "wise.com")];
    const review = analyzeImport(rows, companies);
    expect(review.map((r) => r.matches.map((c) => c.id))).toEqual([["stripe", "wise"], ["wise"]]);
    expect(analyzeImport(rows, companies, { 2: { linkId: "wise" }, 3: { linkId: "wise" } }).map((r) => r.kind))
      .toEqual(["readd", "repeated"]);
    expect(analyzeImport(rows, companies, { 3: { linkId: "unknown" } })[1].kind).toBe("issue");
  });

  it("blocks incompatible file identities and rejects missing names, contact data and formulas", () => {
    const rows = [row(2, "Acme"), row(3, "Acme", "acme.com"), row(4, "Acme", "acme.org"),
      row(5, "Another", "acme.com"), row(6, "", "nothing.com"), row(7, "name@mail.com"),
      row(8, "Duet", "https://localhost"), row(9, "Plains", "", true)];
    expect(analyzeImport(rows, companies).map((r) => r.kind))
      .toEqual(["new", "repeated", "issue", "issue", "issue", "issue", "issue", "issue"]);
  });

  it("flags conflicting domains even when the matched canonical record has no website", () => {
    const noWebsite = [{ ...companies[1], website: null }];
    expect(analyzeImport([row(2, "Wise", "wise.com"), row(3, "Wise", "wise.net")], noWebsite).map((r) => r.kind))
      .toEqual(["readd", "issue"]);
  });
});
