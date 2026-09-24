#!/usr/bin/env node
// Apply a SQL file WHOLESALE to SUPABASE_DB_URL.
//   npm run db:seed                                   -> supabase/seed.sql (upserts; safe)
//   node scripts/db-apply.mjs supabase/schema.sql --force-drop   -> DROPS EVERY TABLE
//
// Since 2026-09-24 the live project changes only through `npm run db:migrate`. schema.sql
// begins by dropping every table, and interview answers are typed by hand and cannot be
// regenerated - so applying it is refused unless --force-drop says you meant to, e.g.
// when building a brand-new project.
//
// Reads SUPABASE_DB_URL from the environment, falling back to .env.local then .env.
// Usage: npm run db:apply
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const envFile of [".env.local", ".env"]) {
  if (process.env.SUPABASE_DB_URL || !existsSync(resolve(root, envFile))) continue;
  for (const line of readFileSync(resolve(root, envFile), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set. Add it to .env.local (see .env.example) or the environment.");
  process.exit(1);
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) ?? "supabase/schema.sql";
if (/schema\.sql$/.test(file) && !args.includes("--force-drop")) {
  console.error(
    "Refusing to apply schema.sql: it DROPS every table, including hand-written interview answers.\n" +
      "  Changing the live schema?  Add a file to supabase/migrations/ and run: npm run db:migrate\n" +
      "  Building a new project?    node scripts/db-apply.mjs supabase/schema.sql --force-drop",
  );
  process.exit(1);
}
const sql = readFileSync(resolve(root, file), "utf8");
// Supabase poolers terminate TLS with certs pg can't always chain; the URL itself is the trust anchor here.
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

console.log(`Applying ${file}...`);
await client.connect();
try {
  await client.query(sql);
  console.log("Done: schema applied clean.");
} finally {
  await client.end();
}
