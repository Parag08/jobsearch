import type { ImportedWorkspace } from "./cvbuilder";

/**
 * Render an imported workspace as supabase/seed.sql.
 *
 * One DO block, so it is a single transaction and the user id is resolved once,
 * by email, against auth.users (the workspace owner must have signed in). Every
 * row upserts on its primary key: re-running the import after editing CVbuilder
 * updates rows in place instead of duplicating them - the ids are deterministic
 * hashes of the CVbuilder slugs (see stableId).
 */
export interface SeedOptions {
  /** The auth.users email that owns this workspace. */
  email: string;
  /** ISO date stamped into the file header. */
  generatedAt: string;
}

export function toSeedSql(ws: ImportedWorkspace, opts: SeedOptions): string {
  const body = buildBody(ws, opts);
  const tag = delimiterFor(body);
  const header = [
    "-- ============================================================================",
    "-- JobSearch seed data - GENERATED, do not edit by hand.",
    "--   source: data/cvbuilder/  |  generator: scripts/import-cvbuilder.ts",
    `--   regenerate: npm run seed:build      generated: ${opts.generatedAt}`,
    "--",
    "-- Run supabase/schema.sql first, then this file (npm run db:seed, or paste it",
    `-- into the Supabase SQL editor). It upserts, so it is safe to re-run.`,
    `-- The workspace owner (${opts.email}) must have signed in at least once, so`,
    "-- that an auth.users row exists for the profile to hang off.",
    "-- ============================================================================",
    "",
  ].join("\n");
  return `${header}do ${tag}\n${body}${tag};\n`;
}

function buildBody(ws: ImportedWorkspace, opts: SeedOptions): string {
  const out: string[] = [];
  out.push("declare");
  out.push("  uid uuid;");
  out.push("begin");
  out.push(`  select id into uid from auth.users where lower(email) = lower(${lit(opts.email)}) limit 1;`);
  out.push("  if uid is null then");
  out.push(
    `    raise exception 'JobSearch seed: no auth.users row for %. Sign in to the app once, then re-run.', ${lit(opts.email)};`,
  );
  out.push("  end if;");
  out.push("");

  const p = ws.profile;
  out.push(
    upsert(
      "profiles",
      ["user_id", "display_name", "target_geos", "role_families", "networks", "visa_context", "premium_llm_budget_usd_month", "contact_lines", "cv_extras"],
      ["uid", lit(p.displayName), textArray(p.targetGeos), textArray(p.roleFamilies), json(p.networks), nullableText(p.visaContext), String(p.premiumLlmBudgetUsdMonth), textArray(p.contactLines), json(p.cvExtras)],
      "user_id",
    ),
  );

  // Sectors key on (user_id, path): a node the app already opened for this path
  // keeps its own id, so the seed updates it instead of colliding on the unique.
  for (const s of ws.sectors) {
    out.push(
      upsert(
        "sectors",
        ["id", "user_id", "path", "role_family", "skills", "companies", "titles", "jd_count", "summary"],
        [uuid(s.id), "uid", textArray(s.path), "null::text", json(s.skills), textArray(s.companies), textArray(s.titles), String(s.jdCount), lit(s.summary)],
        "user_id, path",
      ),
    );
  }

  for (const pr of ws.projects) {
    out.push(
      upsert(
        "projects",
        ["id", "user_id", "name", "org", "dates", "role", "narrative", "outcomes", "skills", "sector_tags"],
        [uuid(pr.id), "uid", lit(pr.name), lit(pr.org), nullableText(pr.dates), nullableText(pr.role), lit(pr.narrative), textArray(pr.outcomes), textArray(pr.skills), uuidArray(pr.sectorTags)],
        "id",
      ),
    );
  }

  for (const b of ws.projects.flatMap((pr) => pr.bullets)) {
    out.push(
      upsert(
        "bullets",
        ["id", "user_id", "project_id", "role_family", "text", "skills", "variants", "strength"],
        [uuid(b.id), "uid", uuid(b.projectId), lit(b.roleFamily), lit(b.text), textArray(b.skills), json(b.variants ?? []), String(b.strength ?? 3)],
        "id",
      ),
    );
  }

  for (const m of ws.masterCvs) {
    out.push(
      upsert(
        "master_cvs",
        ["id", "user_id", "role_family", "summary_line", "bullet_ids", "version"],
        [uuid(m.id), "uid", lit(m.roleFamily), lit(m.summaryLine), uuidArray(m.bulletIds), String(m.version)],
        "user_id, role_family, version",
      ),
    );
  }
  const masterRef = (id: string): string => {
    const m = ws.masterCvs.find((x) => x.id === id);
    if (!m) throw new Error(`toSeedSql: application CV references unknown master CV ${id}`);
    return `(select id from master_cvs where user_id = uid and role_family = ${lit(m.roleFamily)} and version = ${m.version})`;
  };
  const sectorRef = (id: string): string => {
    const s = ws.sectors.find((x) => x.id === id);
    return s ? `(select id from sectors where user_id = uid and path = ${textArray(s.path)})` : uuid(id);
  };

  // application_cvs before applications: applications.cv_id points at them.
  for (const { cv } of ws.applications) {
    if (!cv) continue;
    out.push(
      upsert(
        "application_cvs",
        ["id", "user_id", "master_cv_id", "diff", "bullet_ids", "summary_line", "file_path"],
        [uuid(cv.id), "uid", masterRef(cv.masterCvId), json(cv.diff), uuidArray(cv.bulletIds), lit(cv.summaryLine), nullableText(cv.filePath)],
        "id",
      ),
    );
  }

  for (const { application: a, jdRaw } of ws.applications) {
    out.push(
      upsert(
        "applications",
        ["id", "user_id", "company", "role", "sector_id", "stage", "closed_reason", "jd_extract", "jd_raw", "cv_id", "referral_contact_id", "next_action", "saved_at", "applied_at", "updated_at"],
        [
          uuid(a.id),
          "uid",
          lit(a.company),
          lit(a.role),
          a.sectorId ? sectorRef(a.sectorId) : "null::uuid",
          `${lit(a.stage)}::app_stage`,
          a.closedReason ? `${lit(a.closedReason)}::closed_reason` : "null::closed_reason",
          a.jdExtract ? json(a.jdExtract) : "null::jsonb",
          jdRaw ? lit(jdRaw) : "null::text",
          a.cvVersionId ? uuid(a.cvVersionId) : "null::uuid",
          a.referralContactId ? uuid(a.referralContactId) : "null::uuid",
          nullableText(a.nextAction),
          `${lit(a.savedAt)}::date`,
          a.appliedAt ? `${lit(a.appliedAt)}::date` : "null::date",
          `${lit(a.updatedAt)}::timestamptz`,
        ],
        "id",
      ),
    );
  }

  out.push("end");
  return `${out.join("\n")}\n`;
}

/**
 * An upsert keyed on `conflict` (one column or a natural key); every other
 * column is overwritten on re-run. The row's own id is never overwritten - an
 * existing row keeps the id other tables may already reference.
 */
function upsert(table: string, columns: string[], values: string[], conflict: string): string {
  const keys = new Set([...conflict.split(",").map((c) => c.trim()), "user_id", "id"]);
  const updates = columns
    .filter((c) => !keys.has(c))
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  return [
    `  insert into ${table} (${columns.join(", ")})`,
    `  values (${values.join(", ")})`,
    `  on conflict (${conflict}) do update set ${updates};`,
    "",
  ].join("\n");
}

// ---- literal rendering ------------------------------------------------------------

function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function nullableText(s: string | null | undefined): string {
  return s === null || s === undefined ? "null::text" : lit(s);
}

function uuid(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    throw new Error(`toSeedSql: "${id}" is not a uuid - the import must assign one before seeding`);
  }
  return `'${id}'::uuid`;
}

function textArray(values: string[]): string {
  return values.length === 0 ? "'{}'::text[]" : `array[${values.map(lit).join(", ")}]::text[]`;
}

function uuidArray(values: string[]): string {
  return values.length === 0 ? "'{}'::uuid[]" : `array[${values.map(uuid).join(", ")}]::uuid[]`;
}

function json(value: unknown): string {
  return `${lit(JSON.stringify(value))}::jsonb`;
}

/** A $-quote tag that cannot appear in the body (JD text is arbitrary user content). */
function delimiterFor(body: string): string {
  for (let i = -1; i < 100; i++) {
    const tag = i < 0 ? "$seed$" : `$seed${i}$`;
    if (!body.includes(tag)) return tag;
  }
  throw new Error("toSeedSql: could not find a free dollar-quote tag");
}
