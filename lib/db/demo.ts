import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeDb } from "../repos/fake-db";
import { importCvbuilder } from "../import/cvbuilder";
import { seedFakeDb } from "./seed-fake-db";
import type { ImportedWorkspace } from "../import/cvbuilder";
import { seedDemoExtras, stageDemoApplications } from "../demo/extras";
import { DEMO_TTL_SECONDS, VisitorStore } from "../demo/visitors";
import { DEMO_SOURCE } from "../demo/corpus";

/** The demo workspace's owner id - a fixed placeholder, never a real auth user. */
export const DEMO_USER_ID = "00000000-0000-0000-0000-000000000d3e";

/**
 * Local demo mode: the app runs on an in-memory
 * FakeDb loaded from data/cvbuilder/ - the same corpus supabase/seed.sql is
 * generated from. Cached per server process, so edits made in the demo persist
 * until the next deploy or restart, and nothing ever leaves the box.
 *
 * The cache hangs off globalThis, not this module: Next loads a page and its server
 * actions as separate module instances, and a module-level cache gave each its own copy,
 * so something saved by an action never showed on the page.
 */
const holder = globalThis as { __jobsearchDemoDb?: FakeDb | null };

/** Read a CVbuilder-shaped folder (data/cvbuilder or data/demo) into an imported workspace. */
function loadCorpus(dataDir: string): ImportedWorkspace {
  const readJson = (...p: string[]) => JSON.parse(readFileSync(join(dataDir, ...p), "utf8"));
  const applications = readdirSync(join(dataDir, "applications"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dataDir, "applications", f), "utf8")));
  return importCvbuilder(
    {
      profile: readJson("profile.json"),
      points: readJson("points.json"),
      taxonomy: readJson("taxonomy.json"),
      archetypes: readJson("archetypes.json"),
      applications,
      orgCaps: existsSync(join(dataDir, "org-caps.json")) ? readJson("org-caps.json") : undefined,
    },
    { userId: DEMO_USER_ID },
  );
}

export function getDemoDb(root = process.cwd()): FakeDb {
  const cached = holder.__jobsearchDemoDb;
  if (cached) return cached;
  const db = new FakeDb();
  seedFakeDb(db, loadCorpus(join(root, "data", "cvbuilder")));
  holder.__jobsearchDemoDb = db;
  return db;
}

// ---- the public demo: a fictional person, one copy per visitor --------------------------------

const visitors = globalThis as {
  __jobsearchDemoCorpus?: ImportedWorkspace;
  __jobsearchVisitors?: VisitorStore<FakeDb>;
};

/** The fictional sample person in data/demo/ - never the owner's corpus. Bundled, not read from disk. */
function demoCorpus(): ImportedWorkspace {
  return (visitors.__jobsearchDemoCorpus ??= importCvbuilder(DEMO_SOURCE, { userId: DEMO_USER_ID }));
}

/** The taxonomy the demo reads postings with (lib/demo/canned.ts lexicalExtract). */
export function demoTaxonomy(): unknown {
  return DEMO_SOURCE.taxonomy;
}

/** A fresh sample workspace: the fictional corpus, staged along the pipeline, plus watchlist and practice. */
export function freshVisitorDb(today = new Date().toISOString().slice(0, 10)): FakeDb {
  const db = new FakeDb();
  seedFakeDb(db, stageDemoApplications(structuredClone(demoCorpus()), today));
  seedDemoExtras(db, DEMO_USER_ID, today);
  return db;
}

/** This visitor's own sample workspace (lib/demo/visitors.ts); edits stay theirs until it expires. */
export function getVisitorDemoDb(visitorId: string, max: number): FakeDb {
  visitors.__jobsearchVisitors ??= new VisitorStore(() => freshVisitorDb(), { ttlMs: DEMO_TTL_SECONDS * 1000, max });
  return visitors.__jobsearchVisitors.get(visitorId);
}
