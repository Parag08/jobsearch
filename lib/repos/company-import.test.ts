import { describe, expect, it } from "vitest";
import { analyzeImport, buildImportPlan } from "../companies/import-review";
import { commitCompanyImport, latestCompanyImport, undoCompanyImport } from "./company-import";
import { FakeDb } from "./fake-db";
import { setSourcingCompanyActive } from "./sourcing";

const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const company = (id: string, active: boolean) => ({
  id, user_id: "user", name: id, identity: id, website: null, active, research: ["keep"], research_version: 1,
});
const row = (name: string, number: number) => ({ name, number, website: "", formula: false });

describe("company import persistence", () => {
  it("keeps the latest receipt identity stable through reads and undo until a new import succeeds", async () => {
    const db = new FakeDb();
    const review = (name: string) => buildImportPlan(analyzeImport([row(name, 1)], db.rows("sourcing_companies")));
    await commitCompanyImport(db, "user", first, review("First Company"), 0);
    await expect(latestCompanyImport(db, "user")).resolves.toMatchObject({ id: first, undone_count: null });
    await undoCompanyImport(db, "user", first);
    await expect(latestCompanyImport(db, "user")).resolves.toMatchObject({ id: first, undone_count: 1 });

    await expect(commitCompanyImport(db, "user", second, [], 0)).resolves.toBeNull();
    await expect(latestCompanyImport(db, "user")).resolves.toMatchObject({ id: first });
    await commitCompanyImport(db, "user", second, review("Second Company"), 0);
    await expect(latestCompanyImport(db, "user")).resolves.toMatchObject({ id: second, undone_count: null });
  });

  it("is atomic on a stale plan and idempotent across confirmation and undo", async () => {
    const db = new FakeDb();
    db.seed("sourcing_companies", [company("prior", true), company("removed", false)]);
    const plan = buildImportPlan(analyzeImport([row("new", 1), row("removed", 2)], db.rows("sourcing_companies")));
    await setSourcingCompanyActive(db, "user", "removed", true);
    await expect(commitCompanyImport(db, "user", first, plan, 1)).resolves.toBeNull();
    expect(db.rows("sourcing_companies").map((c) => c.id)).toEqual(["prior", "removed"]);
    expect(await latestCompanyImport(db, "user")).toBeNull();
    await setSourcingCompanyActive(db, "user", "removed", false);
    const saved = await commitCompanyImport(db, "user", first, plan, 1);
    expect(saved).toMatchObject({ new_count: 1, reused_count: 1, skipped_count: 1 });
    expect(await commitCompanyImport(db, "user", first, plan, 1)).toEqual(saved);
    expect(await undoCompanyImport(db, "user", first)).toMatchObject({ undone_count: 2 });
    expect(await commitCompanyImport(db, "user", first, plan, 1)).toMatchObject({ undone_count: 2 });
    expect(db.rows("sourcing_companies").filter((c) => c.active).map((c) => c.id)).toEqual(["prior"]);
  });

  it("undos only latest unchanged memberships, clears unprepared picks and preserves shared records", async () => {
    const db = new FakeDb();
    db.seed("sourcing_companies", [company("retain", false), company("undo", false), company("older", false)]);
    db.seed("sourced_jobs", [
      { id: "unprepared", user_id: "user", company_id: "undo", sourcing_decision: "picked" },
      { id: "prepared", user_id: "user", company_id: "undo", sourcing_decision: "picked" },
      { id: "other", user_id: "other", company_id: "undo", sourcing_decision: "picked" },
    ]);
    db.seed("applications", [{ id: "saved", user_id: "user", company_id: "undo", external_ref: "sourced:prepared" }]);
    db.seed("contacts", [{ id: "contact", user_id: "user", company_id: "undo" }]);
    const review = (...names: string[]) => buildImportPlan(analyzeImport(names.map(row), db.rows("sourcing_companies")));
    await commitCompanyImport(db, "user", first, review("older"), 0);
    await commitCompanyImport(db, "user", second, review("retain", "undo"), 0);
    await setSourcingCompanyActive(db, "user", "retain", false);
    await setSourcingCompanyActive(db, "user", "retain", true);
    expect(await undoCompanyImport(db, "user", first)).toBeNull();
    expect(await undoCompanyImport(db, "other", second)).toBeNull();
    expect(await undoCompanyImport(db, "user", second)).toMatchObject({ undone_count: 1 });
    expect(await undoCompanyImport(db, "user", second)).toMatchObject({ undone_count: 1 });
    expect(db.rows("sourcing_companies")).toMatchObject([
      { id: "retain", active: true }, { id: "undo", active: false, research: ["keep"] }, { id: "older", active: true },
    ]);
    expect(db.rows("sourced_jobs").map((job) => job.sourcing_decision)).toEqual(["available", "picked", "picked"]);
    expect(db.rows("applications")).toMatchObject([{ id: "saved" }]);
    expect(db.rows("contacts")).toMatchObject([{ id: "contact" }]);
  });
});
