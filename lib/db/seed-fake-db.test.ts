import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FakeDb } from "../repos/fake-db";
import { importCvbuilder } from "../import/cvbuilder";
import { seedFakeDb } from "./seed-fake-db";
import { listApplications } from "../repos/applications";
import { listProjects } from "../repos/projects";
import { getLatestMasterCv, getApplicationCv } from "../repos/cvs";
import { listSectors } from "../repos/sectors";
import { getProfile } from "../repos/profiles";

const USER = "00000000-0000-0000-0000-000000000001";
const dataDir = join(process.cwd(), "data", "cvbuilder");
const readJson = (...p: string[]) => JSON.parse(readFileSync(join(dataDir, ...p), "utf8"));

function corpus() {
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
    },
    { userId: USER },
  );
}

describe("seedFakeDb", () => {
  it("loads an imported workspace so every repo reads it back (the demo workspace)", async () => {
    const ws = corpus();
    const db = new FakeDb();
    seedFakeDb(db, ws);

    const profile = await getProfile(db, USER);
    expect(profile?.userId).toBe(USER);

    const projects = await listProjects(db, USER);
    expect(projects).toHaveLength(ws.projects.length);
    expect(projects.flatMap((p) => p.bullets)).toHaveLength(ws.projects.flatMap((p) => p.bullets).length);

    const sectors = await listSectors(db, USER);
    expect(sectors).toHaveLength(ws.sectors.length);

    const apps = await listApplications(db, USER);
    expect(apps).toHaveLength(ws.applications.length);

    // ids are preserved, so cross-references (application -> cv -> master -> bullets) resolve
    const withCv = ws.applications.find((a) => a.cv);
    expect(withCv).toBeDefined();
    const cv = await getApplicationCv(db, USER, withCv!.cv!.id);
    expect(cv?.bulletIds.length).toBeGreaterThan(0);
    const master = await getLatestMasterCv(db, USER, ws.masterCvs[0].roleFamily);
    expect(master).not.toBeNull();
  });

  it("keeps jd_raw as the DB-only audit copy", () => {
    const ws = corpus();
    const db = new FakeDb();
    seedFakeDb(db, ws);
    const rows = db.rows("applications");
    expect(rows.some((r) => typeof r.jd_raw === "string" && r.jd_raw.length > 0)).toBe(true);
  });
});
