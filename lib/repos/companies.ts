import { CompanySchema, type Company, type NewCompany } from "../companies/types";
import { many, type DbClient } from "./db";
import type { CompanyRow } from "./rows";

export type { CompanyRow };

/**
 * Company directory persistence (DESIGN.md section 4).
 *
 * This is the one table in the schema with NO user_id: the directory is shared
 * reference data, not personal data, so every user reads the same rows. RLS
 * therefore grants select to any authenticated user and no write at all -
 * `npm run companies:sync` writes it with the service key.
 */

export function toCompany(r: CompanyRow): Company {
  return CompanySchema.parse({
    id: r.id,
    name: r.name,
    type: r.type,
    careersUrl: r.careers_url,
    ats: r.ats,
    token: r.token,
    confirmed: r.confirmed,
    probedAt: r.probed_at,
  });
}

export function companyRow(c: NewCompany): Omit<CompanyRow, "id"> {
  return {
    name: c.name,
    type: c.type,
    careers_url: c.careersUrl,
    ats: c.ats,
    token: c.token,
    confirmed: c.confirmed,
    probed_at: c.probedAt,
  };
}

/** Upsert on name: re-running the sync updates the board details, never duplicates. */
export async function upsertCompanies(db: DbClient, companies: NewCompany[]): Promise<number> {
  if (companies.length === 0) return 0;
  const rows = await many(
    db.from("companies").upsert(companies.map(companyRow), { onConflict: "name" }).select(),
    "companies",
    "upsert",
  );
  return rows.length;
}

export interface ListCompaniesOptions {
  /** Filter to one hiring type, e.g. "bank" or "regional-platform". */
  type?: string;
}

export async function listCompanies(db: DbClient, opts: ListCompaniesOptions = {}): Promise<Company[]> {
  let q = db.from("companies").select();
  if (opts.type !== undefined) q = q.eq("type", opts.type);
  const rows = await many(q.order("name", { ascending: true }), "companies", "list");
  return rows.map(toCompany);
}

/**
 * Only companies a refresh could actually read today. An "unknown" board is
 * kept in the directory deliberately - it is the queue for the HTML route -
 * but offering it as one click to watch would promise a refresh that cannot run.
 */
export async function watchableCompanies(db: DbClient): Promise<Company[]> {
  const all = await listCompanies(db);
  return all.filter((c) => c.ats !== "unknown" && c.token !== null);
}
