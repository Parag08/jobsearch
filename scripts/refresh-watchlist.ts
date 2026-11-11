/**
 * The daily sourcing run (ROADMAP Now #1, DESIGN section 4 "Scheduling").
 * For every profile: refresh each active watchlist board through the same
 * `refreshWatchlist` the in-app button uses, which also retires roles that
 * have vanished from their board (lib/watchlist/retire.ts).
 *
 *   npm run watchlist:refresh
 *
 * Run daily by .github/workflows/sourcing.yml. Needs SUPABASE_URL (or
 * NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY - the secret key bypasses
 * RLS, so this only ever runs from CI or a trusted machine. Zero LLM tokens.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { DbClient } from "../lib/repos/db";
import { refreshWatchlist } from "../lib/services/refresh-watchlist";
import { HttpBoardFetcher } from "../lib/watchlist/fetcher";

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

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need SUPABASE_URL and SUPABASE_SECRET_KEY (environment, .env.local or .env).");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const db = supabase as unknown as DbClient;
const fetcher = new HttpBoardFetcher(fetch);
const today = new Date().toISOString().slice(0, 10);

const { data: profiles, error } = await supabase.from("profiles").select("user_id, display_name");
if (error) {
  console.error("Could not read profiles:", error.message);
  process.exit(1);
}

let failedUsers = 0;
for (const p of profiles ?? []) {
  const who = (p.display_name as string) || (p.user_id as string);
  try {
    const r = await refreshWatchlist({ db, fetcher }, p.user_id as string, today);
    console.log(
      `${who}: fetched ${r.fetched}, filtered ${r.filtered}, deduped ${r.deduped}, in pipeline ${r.excluded}, ` +
        `upserted ${r.upserted}, retired ${r.retired}, board failures ${r.failures.length}`,
    );
    for (const f of r.failures) console.log(`  ! ${f.company}: ${f.error}`);
  } catch (e) {
    failedUsers++;
    console.error(`${who}: refresh failed - ${e instanceof Error ? e.message : String(e)}`);
  }
}
// A board failing is routine (logged above); a whole refresh failing is worth a red run.
if (failedUsers > 0) process.exit(1);
