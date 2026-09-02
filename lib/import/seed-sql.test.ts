import { describe, it, expect } from "vitest";
import { toSeedSql } from "./seed-sql";
import type { ImportedWorkspace } from "./cvbuilder";

const uuid = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;

const ws: ImportedWorkspace = {
  profile: {
    userId: uuid(1),
    displayName: "Ada O'Hara",
    targetGeos: ["Singapore"],
    roleFamilies: ["product-management"],
    networks: [{ name: "INSEAD", program: "MBA", location: "Singapore" }],
    visaContext: "Student visa",
    premiumLlmBudgetUsdMonth: 0,
    contactLines: ["ada@example.com"],
    cvExtras: [{ id: "add-skills", label: "Skills", text: "Leadership" }],
  },
  projects: [
    {
      id: uuid(2),
      name: "Acme - PM",
      org: "Acme",
      dates: "2024 - 2026",
      role: "PM",
      narrative: "Acme's platform",
      outcomes: [],
      skills: ["product-management"],
      sectorTags: [],
      bullets: [
        {
          id: uuid(3),
          projectId: uuid(2),
          roleFamily: "product-management",
          text: "Launched it",
          skills: ["product-management"],
          variants: [{ label: "short", text: "Launched" }],
          strength: 5,
        },
      ],
    },
  ],
  masterCvs: [
    { id: uuid(4), roleFamily: "product-management", summaryLine: "Ada O'Hara - PM", bulletIds: [uuid(3)], version: 1 },
  ],
  sectors: [
    {
      id: uuid(5),
      path: ["Product Management", "Singapore"],
      skills: { "product-management": 1 },
      companies: ["Globex"],
      titles: ["PM"],
      jdCount: 1,
      summary: "one JD",
    },
  ],
  applications: [
    {
      application: {
        id: uuid(6),
        company: "Globex",
        role: "PM",
        sectorId: uuid(5),
        stage: "saved",
        closedReason: null,
        jdExtract: {
          company: "Globex",
          role: "PM",
          roleFamily: "product-management",
          sectorPath: ["Product Management", "Singapore"],
          skills: ["product-management"],
          keywords: ["product manager"],
          seniority: null,
          visaNote: null,
          location: "Singapore",
        },
        cvVersionId: uuid(7),
        referralContactId: null,
        nextAction: "Confirm",
        savedAt: "2026-08-20",
        appliedAt: null,
        updatedAt: "2026-08-20T10:00:00.000Z",
      },
      jdRaw: "Globex wants a PM; it's urgent",
      cv: {
        id: uuid(7),
        masterCvId: uuid(4),
        diff: { addBulletIds: [], removeBulletIds: [], keywordsToMirror: [], summaryLine: "x", variants: { [uuid(3)]: "short" } },
        bulletIds: [uuid(3)],
        summaryLine: "Ada O'Hara - PM, targeting PM at Globex.",
        filePath: null,
      },
    },
  ],
  warnings: [],
};

describe("toSeedSql", () => {
  const sql = toSeedSql(ws, { email: "ada@example.com", generatedAt: "2026-09-02" });

  it("resolves the user by email inside one transactional DO block", () => {
    expect(sql).toContain("do $seed$");
    expect(sql.trimEnd().endsWith("$seed$;")).toBe(true);
    expect(sql).toContain("select id into uid from auth.users where lower(email) = lower('ada@example.com')");
    expect(sql).toContain("raise exception");
  });

  it("escapes quotes in data rather than breaking out of the literal", () => {
    expect(sql).toContain("'Ada O''Hara'");
    expect(sql).toContain("Globex wants a PM; it''s urgent");
  });

  it("writes every table, and application_cvs before the applications that point at them", () => {
    for (const table of ["profiles", "sectors", "projects", "bullets", "master_cvs", "application_cvs", "applications"]) {
      expect(sql).toContain(`insert into ${table}`);
    }
    expect(sql.indexOf("insert into application_cvs")).toBeLessThan(sql.indexOf("insert into applications "));
    expect(sql.indexOf("insert into master_cvs")).toBeLessThan(sql.indexOf("insert into application_cvs"));
    expect(sql.indexOf("insert into projects")).toBeLessThan(sql.indexOf("insert into bullets"));
  });

  it("is re-runnable: every row upserts, on its natural key where it has one", () => {
    expect(sql).toContain("on conflict (user_id) do update set"); // profiles
    expect(sql).toContain("on conflict (user_id, path) do update set"); // sectors
    expect(sql).toContain("on conflict (user_id, role_family, version) do update set"); // master_cvs
    expect((sql.match(/on conflict \(id\) do update set/g) ?? []).length).toBe(4);
    expect(sql).not.toMatch(/do update set[^;]*\bid = excluded\.id/);
  });

  it("looks rows with a natural key up by it, so a row the app already made is reused", () => {
    expect(sql).toContain(
      "(select id from master_cvs where user_id = uid and role_family = 'product-management' and version = 1)",
    );
    expect(sql).toContain(
      "(select id from sectors where user_id = uid and path = array['Product Management', 'Singapore']::text[])",
    );
  });

  it("renders arrays, jsonb and nulls in postgres syntax", () => {
    expect(sql).toContain("array['Singapore']::text[]");
    expect(sql).toContain("'{}'::text[]"); // outcomes: empty
    expect(sql).toContain("::jsonb");
    expect(sql).toContain("null::text"); // applied_at
  });

  it("carries the imported ids so master CVs and CVs reference real bullets", () => {
    expect(sql).toContain(`'${uuid(3)}'::uuid`);
    expect(sql).toContain(`array['${uuid(3)}'::uuid]::uuid[]`);
  });

  it("refuses to build a block a value could break out of", () => {
    const poisoned = structuredClone(ws);
    poisoned.applications[0].jdRaw = "ends the block: $seed$";
    expect(() => toSeedSql(poisoned, { email: "a@b.c", generatedAt: "2026-09-02" })).not.toThrow();
    expect(toSeedSql(poisoned, { email: "a@b.c", generatedAt: "2026-09-02" })).toContain("do $seed0$");
  });
});
