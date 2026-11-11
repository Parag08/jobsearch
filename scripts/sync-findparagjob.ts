/**
 * Pull the CV corpus from the findparagjob workspace (the hand-maintained source of
 * truth) into data/cvbuilder/, verbatim. Then run `npm run seed:build`.
 *
 *   FINDPARAGJOB_DIR=/path/to/findparagjob npm run data:sync
 *
 * Copies profile.json, points.json, taxonomy.json and archetypes.json, and refreshes
 * every application file already in data/cvbuilder/applications/ from the file of the
 * same name anywhere under <dir>/applications/. It never adds or deletes application
 * files (which postings get imported is decided here), and never touches files this
 * repo owns: org-caps.json, letter-bank.json.
 */
import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of [".env.local", ".env"]) if (existsSync(join(root, f))) process.loadEnvFile(join(root, f));

const src = process.env.FINDPARAGJOB_DIR;
if (!src || !existsSync(join(src, "profile", "points.json"))) {
  console.error("Set FINDPARAGJOB_DIR to the findparagjob workspace (it must contain profile/points.json).");
  process.exit(1);
}

const dataDir = join(root, "data", "cvbuilder");

for (const f of ["profile.json", "points.json", "taxonomy.json", "archetypes.json"]) {
  copyFileSync(join(src, "profile", f), join(dataDir, f));
  console.log(`profile/${f}`);
}

const index = new Map<string, string>();
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".json") && !index.has(name)) index.set(name, p);
  }
};
walk(join(src, "applications"));

const appsDir = join(dataDir, "applications");
const missing: string[] = [];
for (const f of readdirSync(appsDir).filter((n) => n.endsWith(".json"))) {
  const from = index.get(f);
  if (!from) { missing.push(f); continue; }
  copyFileSync(from, join(appsDir, basename(f)));
  console.log(`applications/${f}`);
}
if (missing.length) console.warn(`not found in findparagjob, left as is: ${missing.join(", ")}`);
console.log("Done. Next: npm run seed:build");
