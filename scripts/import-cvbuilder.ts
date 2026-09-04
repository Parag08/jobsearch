#!/usr/bin/env vite-node
/**
 * Turn data/cvbuilder/ into supabase/seed.sql.
 *
 * All the logic lives in lib/import/ (pure + unit-tested); this file only does
 * I/O. Run it after editing anything under data/cvbuilder/:
 *
 *   npm run seed:build                       # writes supabase/seed.sql
 *   npm run seed:build -- --email me@x.com   # workspace owner; otherwise the
 *                                            # owner already in seed.sql, then
 *                                            # the first email in contactLines
 *   npm run db:seed                          # applies it to SUPABASE_DB_URL
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { importCvbuilder } from "../lib/import/cvbuilder";
import { toSeedSql } from "../lib/import/seed-sql";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data", "cvbuilder");
const readJson = (...parts: string[]) => JSON.parse(readFileSync(join(dataDir, ...parts), "utf8"));

const applicationsDir = join(dataDir, "applications");
const applications = readdirSync(applicationsDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(applicationsDir, f), "utf8")));

const source = {
  profile: readJson("profile.json"),
  points: readJson("points.json"),
  taxonomy: readJson("taxonomy.json"),
  archetypes: readJson("archetypes.json"),
  applications,
};

const today = new Date().toISOString().slice(0, 10);
const workspace = importCvbuilder(source, {
  // Placeholder: the generated SQL resolves the real user_id from auth.users by email.
  userId: "00000000-0000-0000-0000-000000000000",
  // `today` is left at its default on purpose - see ImportOptions. Only the
  // header comment below carries the wall clock, and that is stripped before
  // the committed-seed comparison.
});

const outFile = join(root, "supabase", "seed.sql");

// Owner precedence. The existing seed's owner outranks profile.json on purpose:
// contactLines lists the INSEAD address first, but the auth.users row is the
// gmail one, so re-deriving from the profile silently retargets the workspace at
// an account that does not exist (it did, on 2026-09-04, and the seed aborted).
const flag = process.argv.indexOf("--email");
const committedOwner = existsSync(outFile)
  ? readFileSync(outFile, "utf8").match(/lower\('([^']+)'\)/)?.[1]
  : undefined;
const email =
  (flag > -1 ? process.argv[flag + 1] : undefined) ??
  process.env.SEED_EMAIL ??
  committedOwner ??
  workspace.profile.contactLines.join(" ").match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
if (!email) {
  console.error("No owner email found. Pass --email you@example.com or set SEED_EMAIL.");
  process.exit(1);
}

writeFileSync(outFile, toSeedSql(workspace, { email, generatedAt: today }), "utf8");

const bullets = workspace.projects.flatMap((p) => p.bullets);
console.log(`Imported data/cvbuilder -> supabase/seed.sql (owner: ${email})`);
console.log(
  [
    `  ${workspace.projects.length} projects`,
    `${bullets.length} bullets`,
    `${workspace.masterCvs.length} master CVs`,
    `${workspace.sectors.length} sectors`,
    `${workspace.applications.length} applications`,
  ].join(", "),
);
for (const w of workspace.warnings) console.warn(`  ! ${w}`);
