import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import { parseCompanyFile } from "./import-file";
import { IMPORT_MAX_BYTES } from "./import-review";

describe("company import files", () => {
  it("reads UTF-8 BOM, semicolon CSV, quoted fields and physical row numbers", () => {
    const data = new TextEncoder().encode('\ufeffEmployer;Company site;Notes\r\n"One; Inc";one.com;"line 1\nline 2"\r\n;;\r\nTwo;;\r\n');
    expect(parseCompanyFile("list.CSV", data)[0].rows).toEqual([
      { number: 1, cells: { 0: { text: "Employer" }, 1: { text: "Company site" }, 2: { text: "Notes" } } },
      { number: 2, cells: { 0: { text: "One; Inc" }, 1: { text: "one.com" }, 2: { text: "line 1\nline 2" } } },
      { number: 5, cells: { 0: { text: "Two" } } },
    ]);
  });

  it("uses the semicolon header when ignored fields contain commas", () => {
    const data = new TextEncoder().encode("Company name;Website;Notes\nAcme;acme.com;One, two\nBeta;beta.com;Three, four\n");
    expect(parseCompanyFile("list.csv", data)[0].rows[1].cells).toEqual({
      0: { text: "Acme" }, 1: { text: "acme.com" }, 2: { text: "One, two" },
    });
  });

  it("prefers comma when both headers match equally despite extra semicolons", () => {
    const data = new TextEncoder().encode("Company name,Notes;ref;owner\nAcme,One;two;three\nBeta,Four;five;six\n");
    expect(parseCompanyFile("list.csv", data)[0].rows[1].cells).toEqual({
      0: { text: "Acme" }, 1: { text: "One;two;three" },
    });
  });

  it("reads visible worksheets only and flags formula cells without using cached values or links", () => {
    const book = utils.book_new();
    utils.book_append_sheet(book, utils.aoa_to_sheet([["Secret"]]), "Hidden");
    utils.book_set_sheet_visibility(book, "Hidden", 1);
    const sheet = utils.aoa_to_sheet([["Company", "Website"], [], ["Acme", "acme.com"]]);
    sheet.B3 = { t: "s", v: "cached", f: '"formula"' };
    sheet.A3.l = { Target: "https://other.com" };
    utils.book_append_sheet(book, sheet, "Targets");
    const sheets = parseCompanyFile("list.xlsx", new Uint8Array(write(book, { type: "array", bookType: "xlsx", compression: true })));
    expect(sheets.map((s) => s.name)).toEqual(["Targets"]);
    expect(sheets[0].rows[1]).toEqual({ number: 3, cells: { 0: { text: "Acme" }, 1: { text: "", formula: true } } });
  });

  it("rejects unsupported, oversized, empty and unreadable files", () => {
    expect(() => parseCompanyFile("old.xls", new Uint8Array())).toThrow(/Save As/);
    expect(() => parseCompanyFile("large.csv", new Uint8Array(IMPORT_MAX_BYTES + 1))).toThrow(/5 MB/);
    expect(() => parseCompanyFile("blank.csv", new TextEncoder().encode("\n,\n"))).toThrow(/empty/);
    expect(() => parseCompanyFile("locked.xlsx", new TextEncoder().encode("not xlsx"))).toThrow(/unreadable or locked/);
  });
});
