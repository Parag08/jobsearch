import { norm } from "../types";
import { companyWebsite } from "../watchlist/daily";
import { publicCompanyName } from "./public-company";

export const IMPORT_MAX_BYTES = 5_000_000;
export const IMPORT_MAX_ROWS = 1_000;

export type ImportCell = { text: string; formula?: boolean };
export type ImportSheet = { name: string; rows: { number: number; cells: Record<number, ImportCell> }[] };
export type ImportMapping = { start: number; headers: boolean; name: number | null; website: number | null };
export type ImportRow = { number: number; name: string; website: string; formula: boolean };
export type ImportCompany = { id: string; name: string; identity: string; website: string | null; active: boolean };
export type ImportOverride = { name?: string; website?: string; formula?: boolean; skip?: boolean; linkId?: string };
export type ReviewRow = ImportRow & {
  kind: "new" | "readd" | "existing" | "repeated" | "skipped" | "issue";
  reason?: string;
  matches: ImportCompany[];
  company?: ImportCompany;
};
export type ImportPlanRow = {
  id: string | null;
  name: string | null;
  identity: string;
  website: string | null;
  active: boolean | null;
};

export function importColumns(sheet: ImportSheet, start: number, headers: boolean) {
  const columns = new Set<number>();
  for (const row of sheet.rows) {
    if (row.number >= start) Object.keys(row.cells).forEach((c) => columns.add(Number(c)));
  }
  const header = headers ? sheet.rows.find((r) => r.number === start)?.cells : undefined;
  return [...columns].sort((a, b) => a - b).map((index) => ({ index, title: header?.[index]?.text ?? "" }));
}

export function suggestImportColumns(sheet: ImportSheet, start: number, headers: boolean) {
  const columns = importColumns(sheet, start, headers);
  const unique = (pattern: RegExp) => {
    const matches = columns.filter((c) => pattern.test(norm(c.title).replace(/[_-]+/g, " ")));
    return matches.length === 1 ? matches[0].index : null;
  };
  return {
    name: unique(/^(company name|company|employer|employer name|organization|organisation)$/),
    website: unique(/^(website|company website|company site|company url|domain|url|web site)$/),
  };
}

export function mapImportRows(sheet: ImportSheet, { start, headers, name, website }: ImportMapping): ImportRow[] | null {
  if (!Number.isInteger(start) || start < 1 || name === null || name === website) return null;
  const columns = new Set(importColumns(sheet, start, headers).map((c) => c.index));
  if (!columns.has(name) || (website !== null && !columns.has(website))) return null;
  return sheet.rows.filter((row) => headers ? row.number > start : row.number >= start).map(({ number, cells }) => ({
    number,
    name: cells[name]?.text ?? "",
    website: website === null ? "" : cells[website]?.text ?? "",
    formula: Boolean(cells[name]?.formula || (website !== null && cells[website]?.formula)),
  }));
}

export function analyzeImport(
  rows: ImportRow[], companies: ImportCompany[], overrides: Record<number, ImportOverride> = {},
): ReviewRow[] {
  const byName = new Map(companies.map((c) => [c.identity, c]));
  const byWebsite = new Map(companies.filter((c) => c.website).map((c) => [c.website, c]));
  const seenNames = new Map<string, { number: number; website: string }>();
  const seenWebsites = new Map<string, string>();

  return rows.map((source): ReviewRow => {
    const change = overrides[source.number] ?? {};
    const row = { ...source, name: change.name ?? source.name, website: change.website ?? source.website,
      formula: change.formula ?? source.formula };
    if (change.skip) return { ...row, kind: "skipped", matches: [], reason: "Skipped by you" };
    const problem = (reason: string, matches: ImportCompany[] = []): ReviewRow => ({ ...row, kind: "issue", matches, reason });
    if (row.formula || /^=/.test(row.name.trim()) || /^=/.test(row.website.trim())) return problem("Replace formulas with plain values.");
    const name = publicCompanyName(row.name);
    if (!name) return problem(row.name.trim() ? "Use a public organization name without personal details." : "Company name is missing.");
    const rawWebsite = row.website.trim();
    const website = rawWebsite && !/\s/.test(rawWebsite) ? companyWebsite(rawWebsite.replace(/^http:\/\//i, "https://")) : rawWebsite ? null : "";
    if (website === null || website.length > 261) return problem("Enter a public website, or clear the optional field.");

    const named = byName.get(norm(name));
    const hosted = website ? byWebsite.get(website) : undefined;
    const matches = [...new Set([named, hosted])].filter((c): c is ImportCompany => Boolean(c));
    const linked = matches.find((c) => c.id === change.linkId);
    if (!linked && (change.linkId || (hosted && hosted !== named) || (named?.website && website && named.website !== website))) {
      return problem("The name and website point to different company identities. Edit, link to an existing company, or skip.", matches);
    }
    const company = linked ?? named;
    const identity = company?.identity ?? norm(name);
    const reviewedWebsite = linked ? linked.website ?? "" : company?.website || website;
    const prior = seenNames.get(identity);
    const other = reviewedWebsite ? seenWebsites.get(reviewedWebsite) : undefined;
    if ((other && other !== identity) || (prior?.website && reviewedWebsite && prior.website !== reviewedWebsite)) {
      return problem("This row conflicts with an earlier row’s name or website. Edit or skip it.");
    }
    if (reviewedWebsite) seenWebsites.set(reviewedWebsite, identity);
    seenNames.set(identity, { number: prior?.number ?? row.number, website: prior?.website || reviewedWebsite });
    if (prior) return { ...row, kind: "repeated", matches, reason: `Same company as row ${prior.number}.` };
    return { ...row, name, website, matches, company, kind: company ? (company.active ? "existing" : "readd") : "new" };
  });
}

export function importCounts(rows: ReviewRow[]) {
  const stats = { new: 0, readd: 0, existing: 0, skipped: 0, issue: 0 };
  for (const row of rows) stats[row.kind === "repeated" ? "skipped" : row.kind]++;
  return stats;
}

export function buildImportPlan(rows: ReviewRow[]): ImportPlanRow[] {
  if (rows.some((r) => r.kind === "issue")) return [];
  return rows.flatMap((r): ImportPlanRow[] => {
    if (r.kind === "new") return [{ id: null, name: r.name, identity: norm(r.name), website: r.website || null, active: null }];
    if (r.company && (r.kind === "readd" || r.kind === "existing")) {
      const { id, identity, website, active } = r.company;
      return [{ id, name: null, identity, website, active }];
    }
    return [];
  });
}
