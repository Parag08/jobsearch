import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeDb } from "../repos/fake-db";
import { importCvbuilder } from "../import/cvbuilder";
import { seedFakeDb } from "./seed-fake-db";

/** The demo workspace's owner id - a fixed placeholder, never a real auth user. */
export const DEMO_USER_ID = "00000000-0000-0000-0000-000000000d3e";

/**
 * Demo mode: when Supabase is not configured the app runs on an in-memory
 * FakeDb loaded from data/cvbuilder/ - the same corpus supabase/seed.sql is
 * generated from. Cached per server process, so edits made in the demo persist
 * until the next deploy or restart, and nothing ever leaves the box.
 */
let cached: FakeDb | null = null;

export function getDemoDb(root = process.cwd()): FakeDb {
  if (cached) return cached;
  const dataDir = join(root, "data", "cvbuilder");
  const readJson = (...p: string[]) => JSON.parse(readFileSync(join(dataDir, ...p), "utf8"));
  const applications = readdirSync(join(dataDir, "applications"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dataDir, "applications", f), "utf8")));
  const ws = importCvbuilder(
    {
      profile: readJson("profile.json"),
      points: readJson("points.json"),
      taxonomy: readJson("taxonomy.json"),
      archetypes: readJson("archetypes.json"),
      applications,
    },
    { userId: DEMO_USER_ID },
  );
  const db = new FakeDb();
  seedFakeDb(db, ws);
  cached = db;
  return db;
}

/** Test hook. */
export function resetDemoDb(): void {
  cached = null;
}
