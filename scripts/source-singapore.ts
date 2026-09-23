/**
 * One-off: pull Singapore roles that match the target profile into a user's
 * sourced_jobs, and watch the companies that produced them.
 *
 *   npm run source:sg
 *   npm run source:sg -- --dry
 *
 * Why this is not just `refreshWatchlist`: that service has no geography or role
 * filter, so watching Databricks alone would insert 883 postings and the 31 readable
 * boards together would insert several thousand, almost all irrelevant. Filtering
 * belongs in the service - until it is there, this script does the narrow thing
 * rather than flooding the table. See DESIGN.md section 4.
 *
 * Reads only public keyless boards, through the same mappers the app uses.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { atsEndpoint } from "../lib/watchlist/ats";
import { mapBoardPayload } from "../lib/watchlist/mappers";
import { upsertSourcedJobs } from "../lib/repos/sourced-jobs";
import { addWatchlistEntry } from "../lib/repos/watchlist";
import { COMPANY_SEED_PATH, type CompanySeedEntry } from "../lib/companies/types";
import type { DbClient } from "../lib/repos/db";
import type { SourcedJob } from "../lib/types";

for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* file absent */
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local or .env.");
  process.exit(1);
}

const DRY = process.argv.includes("--dry");

/** Singapore, including regional postings that list it among their locations. */
const SG = /singapore/i;

/**
 * Roles worth surfacing for a post-MBA product/strategy target. Deliberately wider
 * than "product manager": the 2026-09-23 run showed Singapore product roles are rare,
 * and strategy/ops adjacencies are where the real matches were.
 */
const WANTED =
  /(product manager|product lead|senior product|principal product|group product|product owner|product strateg|platform product|technical product|product operations|ai product|head of product|program manager|programme manager|strategy|chief of staff|business operations|bizops|corporate development|transformation|innovation)/i;

/** Roles that match WANTED but are not what he is looking for. */
const NOT_WANTED = /(account executive|sales|recruiter|recruiting|payroll|accounting|counsel|marketing manager)/i;

const doc = JSON.parse(readFileSync(resolve(COMPANY_SEED_PATH), "utf8")) as { companies: CompanySeedEntry[] };
const readable = doc.companies.filter((c) => c.ats && c.ats !== "unknown" && c.token);

const supabase = createClient(url, key, { auth: { persistSession: false } });
const db = supabase as unknown as DbClient;

// The workspace owner: one profile today, so resolve rather than hardcode an id.
const { data: profiles, error } = await supabase.from("profiles").select("user_id, display_name");
if (error || !profiles?.length) {
  console.error("Could not read profiles:", error?.message ?? "none found");
  process.exit(1);
}
const userId = profiles[0].user_id as string;
console.log(`Workspace: ${profiles[0].display_name || userId}\n`);

const matches: { job: Omit<SourcedJob, "id">; company: CompanySeedEntry }[] = [];
const failures: string[] = [];

await Promise.all(
  readable.map(async (c) => {
    try {
      const endpoint = atsEndpoint(c.ats as Exclude<typeof c.ats, "unknown">, c.token!);
      const res = await fetch(endpoint, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const jobs = mapBoardPayload(c.ats as never, await res.json(), c.company);
      for (const j of jobs) {
        const loc = j.location ?? "";
        if (!SG.test(loc)) continue;
        if (!WANTED.test(j.title) || NOT_WANTED.test(j.title)) continue;
        const { id: _drop, ...rest } = j;
        matches.push({ job: rest, company: c });
      }
    } catch (e) {
      failures.push(`${c.company}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }),
);

matches.sort((a, b) => a.job.company.localeCompare(b.job.company) || a.job.title.localeCompare(b.job.title));

console.log(`${matches.length} Singapore matches across ${readable.length} boards:\n`);
for (const { job } of matches) {
  console.log(`  ${job.company.padEnd(22)} ${job.title}`);
  console.log(`  ${"".padEnd(22)} ${job.location ?? ""}`);
}
if (failures.length) console.log(`\nBoards that failed:\n  ${failures.join("\n  ")}`);

if (DRY) {
  console.log("\n--dry: nothing written.");
} else if (matches.length > 0) {
  const written = await upsertSourcedJobs(db, userId, matches.map((m) => m.job));

  const producing = [...new Map(matches.map((m) => [m.company.company, m.company])).values()];
  for (const c of producing) {
    await addWatchlistEntry(db, userId, {
      company: c.company,
      careersUrl: c.careersUrl,
      ats: c.ats as never,
      token: c.token ?? null,
      active: true,
      addedAt: new Date().toISOString().slice(0, 10),
    });
  }

  console.log(`\nWrote ${written.length} roles to sourced_jobs.`);
  console.log(`Watching ${producing.length} companies that produced them.`);
  console.log("Open /app/watchlist to see them.");
}
