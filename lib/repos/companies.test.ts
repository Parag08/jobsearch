import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { companyFromSeed } from "../companies/types";
import { listCompanies, upsertCompanies, watchableCompanies } from "./companies";

const grab = companyFromSeed({ company: "Grab", type: "regional-platform", careersUrl: "https://grab.careers/", ats: "smartrecruiters", token: "grab" });
const dbs = companyFromSeed({ company: "DBS Bank", type: "bank", careersUrl: "https://www.dbs.com/careers" });
const stripe = companyFromSeed({ company: "Stripe", type: "us-tech-apac", careersUrl: "https://stripe.com/jobs", ats: "greenhouse", token: "stripe" });

describe("company directory repo", () => {
  it("is central: no user_id is written, because the directory is shared (rule 4)", async () => {
    const db = new FakeDb();
    await upsertCompanies(db, [grab]);
    const row = db.rows("companies")[0] as unknown as Record<string, unknown>;
    expect(row).toMatchObject({ name: "Grab", type: "regional-platform", ats: "smartrecruiters" });
    expect(row).not.toHaveProperty("user_id");
  });

  it("upserts on name, so re-running the sync updates instead of duplicating", async () => {
    const db = new FakeDb();
    await upsertCompanies(db, [grab, dbs]);
    await upsertCompanies(db, [{ ...grab, ats: "unknown", token: null }, dbs]);
    const all = await listCompanies(db);
    expect(all).toHaveLength(2);
    expect(all.find((c) => c.name === "Grab")?.ats).toBe("unknown");
  });

  it("returns an empty list rather than throwing when nothing is synced yet", async () => {
    expect(await listCompanies(new FakeDb())).toEqual([]);
  });

  it("filters by type, the axis that records how an employer hires", async () => {
    const db = new FakeDb();
    await upsertCompanies(db, [grab, dbs, stripe]);
    const banks = await listCompanies(db, { type: "bank" });
    expect(banks.map((c) => c.name)).toEqual(["DBS Bank"]);
  });

  it("watchableCompanies returns only those with a verified board", async () => {
    const db = new FakeDb();
    await upsertCompanies(db, [grab, dbs, stripe]);
    const names = (await watchableCompanies(db)).map((c) => c.name).sort();
    expect(names).toEqual(["Grab", "Stripe"]);
  });

  it("upserting an empty list is a no-op, not an error", async () => {
    const db = new FakeDb();
    await expect(upsertCompanies(db, [])).resolves.toEqual(0);
    expect(await listCompanies(db)).toEqual([]);
  });

  it("reports how many rows it wrote, so the sync script can say so", async () => {
    const db = new FakeDb();
    expect(await upsertCompanies(db, [grab, dbs, stripe])).toBe(3);
  });
});
