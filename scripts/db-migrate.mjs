#!/usr/bin/env node
/**
 * Apply pending migrations from supabase/migrations/ in filename order.
 *
 *   npm run db:migrate
 *
 * Replaces drop-and-recreate for the live project (switched 2026-09-24, CLAUDE.md). Each
 * file runs once, in its own transaction, and is recorded in `schema_migrations`, so a
 * re-run applies only what is new and never touches existing data.
 *
 * Needs SUPABASE_DB_URL (session pooler, password included) in the environment,
 * .env.local or .env - the same variable db:apply and db:seed use.
 */
import pg from "pg";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const dir = resolve(root, "supabase/migrations");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort() : [];

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )`);
  const { rows } = await client.query("select version from schema_migrations");
  const applied = new Set(rows.map((r) => r.version));
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log(`Up to date (${files.length} migration${files.length === 1 ? "" : "s"} applied).`);
  }
  for (const f of pending) {
    const sql = readFileSync(resolve(dir, f), "utf8");
    process.stdout.write(`Applying ${f}... `);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (version) values ($1)", [f]);
      await client.query("commit");
      console.log("done");
    } catch (err) {
      await client.query("rollback");
      console.log("FAILED - rolled back, nothing changed");
      throw err;
    }
  }
} finally {
  await client.end();
}
