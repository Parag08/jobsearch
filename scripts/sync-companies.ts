/**
 * Sync the company directory into Supabase (DESIGN.md section 4).
 *
 *   npm run companies:sync
 *
 * data/singapore/companies.json -> the central `companies` table. Upserts on name,
 * so re-running after `npm run boards:probe` refreshes verified ats/token without
 * duplicating anything.
 *
 * Writes with the SERVICE key on purpose: the directory has no user_id and no write
 * policy, so RLS blocks every client. Reading it needs no key - any signed-in user
 * can select every row.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { companyFromSeed, COMPANY_SEED_PATH, type CompanySeedEntry } from "../lib/companies/types";
import { upsertCompanies, listCompanies } from "../lib/repos/companies";
import type { DbClient } from "../lib/repos/db";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY in .env.local or .env.\n" +
      "The directory has no write policy, so the anon key cannot write it.",
  );
  process.exit(1);
}

const doc = JSON.parse(readFileSync(resolve(COMPANY_SEED_PATH), "utf8")) as { companies: CompanySeedEntry[] };
const companies = doc.companies.map(companyFromSeed);

const supabase = createClient(url, key, { auth: { persistSession: false } });
const db = supabase as unknown as DbClient;

const withBoard = companies.filter((c) => c.ats !== "unknown").length;
console.log(`Syncing ${companies.length} companies (${withBoard} with a verified board)...`);

const written = await upsertCompanies(db, companies);
const all = await listCompanies(db);

const byType = new Map<string, { n: number; board: number }>();
for (const c of all) {
  const e = byType.get(c.type) ?? { n: 0, board: 0 };
  e.n++;
  if (c.ats !== "unknown") e.board++;
  byType.set(c.type, e);
}

console.log(`\nWrote ${written}. Directory now holds ${all.length}:\n`);
for (const [type, e] of [...byType].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${type.padEnd(22)} ${String(e.n).padStart(3)}  (${e.board} readable)`);
}
