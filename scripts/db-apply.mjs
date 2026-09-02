#!/usr/bin/env node
// Apply a SQL file (default supabase/schema.sql) WHOLESALE to SUPABASE_DB_URL.
//   npm run db:apply   -> supabase/schema.sql (drop-and-recreate, see below)
//   npm run db:seed    -> supabase/seed.sql   (upserts the CVbuilder import)
// Drop-and-recreate policy (CLAUDE.md): this wipes and rebuilds every table.
// Valid ONLY until live data exists - then freeze schema.sql, switch to
// numbered migrations, and delete this script + the db.yml workflow.
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

const file = process.argv[2] ?? "supabase/schema.sql";
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
