import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { importCvbuilder } from "./cvbuilder";
import { toSeedSql } from "./seed-sql";
import { MasterCvSchema, type Bullet } from "../types";

/**
 * The real workspace in data/cvbuilder/ - the actual CV content this repo runs on.
 * These are integrity checks, not fixtures: if editing the data breaks a reference
 * (a base CV pointing at a retired point, a bullet with no role), this fails here
 * rather than at seed time against a live database.
 */
const dataDir = join(process.cwd(), "data", "cvbuilder");
const readJson = (...parts: string[]) => JSON.parse(readFileSync(join(dataDir, ...parts), "utf8"));

const applicationFiles = readdirSync(join(dataDir, "applications"))
  .filter((f) => f.endsWith(".json"))
  .sort();

const source = {
  profile: readJson("profile.json"),
  points: readJson("points.json"),
  taxonomy: readJson("taxonomy.json"),
  archetypes: readJson("archetypes.json"),
  applications: applicationFiles.map((f) => readJson("applications", f)),
};

// No `today`: the import must be reproducible, or the committed-seed guard
// below would fail on any day other than the one seed.sql was built on.
const ws = importCvbuilder(source, { userId: "00000000-0000-0000-0000-000000000000" });
const bullets: Bullet[] = ws.projects.flatMap((p) => p.bullets);

describe("the real CVbuilder workspace", () => {
  it("imports every active point exactly once, under a real project", () => {
    const active = source.points.points.filter((p: { status: string }) => p.status === "active");
    expect(bullets).toHaveLength(active.length);
    expect(new Set(bullets.map((b) => b.id)).size).toBe(bullets.length);
    const projectIds = new Set(ws.projects.map((p) => p.id));
    for (const b of bullets) expect(projectIds.has(b.projectId)).toBe(true);
  });

  it("keeps the profile facts the CV is built from", () => {
    expect(ws.profile.displayName).toBe("Parag Rahangdale");
    expect(ws.profile.targetGeos).toEqual(["Singapore"]);
    expect(ws.profile.visaContext).toMatch(/Singapore Student Visa/);
    expect(ws.profile.contactLines.length).toBeGreaterThan(0);
    expect(ws.profile.cvExtras.length).toBe(source.profile.additional.length);
    expect(ws.profile.roleFamilies).toEqual(
      source.archetypes.archetypes.map((a: { id: string }) => a.id),
    );
  });

  it("gives every archetype a master CV whose bullets all exist", () => {
    const ids = new Set(bullets.map((b) => b.id));
    for (const a of source.archetypes.archetypes) {
      const master = ws.masterCvs.find((m) => m.roleFamily === a.id);
      expect(master, `no master CV for archetype "${a.id}"`).toBeDefined();
      expect(() => MasterCvSchema.parse(master)).not.toThrow();
      expect(master!.bulletIds.length).toBeGreaterThan(0);
      for (const id of master!.bulletIds) expect(ids.has(id)).toBe(true);
    }
    // master.json (v1) and generic.json (v2) share the "general" family; latest wins.
    const general = ws.masterCvs.filter((m) => m.roleFamily === "general");
    expect(general.map((m) => m.version).sort()).toEqual([1, 2]);
  });

  it("imports the real applications with an extract and the CV that was built", () => {
    // Two Bain roles at the same firm, deliberately different CVs (TIG vs general).
    expect(
      ws.applications.map((a) => `${a.application.company} - ${a.application.role}`).sort(),
    ).toEqual([
      "BCG (Boston Consulting Group) - Consultant, Singapore (Post-MBA)",
      "Bain & Company - Consultant (General Consulting)",
      "Bain & Company - Consultant, Technology Insights Group (TIG)",
      "Microsoft - Regional Partner Development Manager, Singapore",
      "Tiktok - Product Manager Project Intern (TikTok Live-Ecosystem Governance)",
    ]);
    for (const { application, jdRaw, cv } of ws.applications) {
      expect(jdRaw.length).toBeGreaterThan(0);
      expect(application.jdExtract).not.toBeNull();
      expect(application.jdExtract!.skills.length).toBeGreaterThan(0);
      expect(application.jdExtract!.sectorPath).toContain("Singapore");
      expect(application.stage).toBe("saved"); // CVbuilder never recorded submission
      expect(cv, `${application.company} has no CV`).not.toBeNull();
      expect(cv!.bulletIds.length).toBeGreaterThan(0);
      expect(application.cvVersionId).toBe(cv!.id);
    }
  });

  it("flags the postings no archetype claims instead of silently guessing", () => {
    // A posting only gets its role family from the corpus once it is evidence in
    // archetypes.json. These three are not, so the family is a taxonomy guess -
    // and the Bain TIG guess is demonstrably wrong (product-strategy, for a
    // consulting role). Warned rather than silently trusted; see docs/MEMORY.md.
    const unclaimed = ws.warnings
      .filter((w) => /role family guessed/.test(w))
      .map((w) => w.match(/"([^"]+)"/)?.[1])
      .sort();
    expect(unclaimed).toEqual([
      "bain-consultant-general",
      "bain-tig-consultant",
      "microsoft-regional-partner-development-manager",
    ]);
    expect(ws.warnings.filter((w) => !/role family guessed/.test(w))).toEqual([]);
  });

  it("opens a sector per role family and geography, with a cached summary", () => {
    expect(ws.sectors.length).toBeGreaterThan(0);
    for (const s of ws.sectors) {
      expect(s.path.length).toBeGreaterThan(1);
      expect(s.jdCount).toBeGreaterThan(0);
      expect(s.summary.length).toBeGreaterThan(0);
    }
    const sectorIds = new Set(ws.sectors.map((s) => s.id));
    for (const { application } of ws.applications) expect(sectorIds.has(application.sectorId!)).toBe(true);
  });

  it("has a committed supabase/seed.sql that matches the data", () => {
    const committed = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
    const email = committed.match(/lower\('([^']+)'\)/)?.[1];
    expect(email, "seed.sql has no owner email - regenerate it with npm run seed:build").toBeTruthy();
    const rebuilt = toSeedSql(ws, { email: email!, generatedAt: "ignored" });
    // \r-insensitive: git may check seed.sql out with CRLF on Windows.
    const strip = (s: string) => s.replace(/\r/g, "").replace(/^--.*$/gm, "").trim();
    expect(
      strip(rebuilt),
      "data/cvbuilder changed without rebuilding: run npm run seed:build",
    ).toBe(strip(committed));
  });
});
