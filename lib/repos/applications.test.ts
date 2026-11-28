import { createClient } from "@supabase/supabase-js";
import { describe, it, expect, vi } from "vitest";
import { asDbClient } from "../db/supabase";
import type { Application } from "../types";
import { FakeDb } from "./fake-db";
import { LIST_LIMIT } from "./db";
import {
  getApplication,
  insertApplication,
  listApplications,
  listUnextractedPostings,
  updateApplication,
  type NewApplication,
} from "./applications";

const base: NewApplication = {
  company: "Grab",
  role: "Senior PM",
  sectorId: null,
  stage: "saved",
  closedReason: null,
  jdExtract: null,
  cvVersionId: null,
  referralContactId: null,
  nextAction: "tailor CV",
  savedAt: "2026-08-29",
  appliedAt: null,
  updatedAt: "2026-08-29T00:00:00Z",
};

describe("applications repo", () => {
  it("includes older manually saved applications for adoption by sync", async () => {
    const db = new FakeDb();
    const old = await insertApplication(db, "u1", base);
    for (let i = 0; i < LIST_LIMIT; i++) {
      await insertApplication(db, "u1", { ...base, company: `new-${i}`, updatedAt: "2099-01-01T00:00:00Z" });
    }
    expect((await listApplications(db, "u1")).at(-1)?.id).toBe(old.id);
  });

  it("insertApplication stores jd_raw for audit but the domain object never carries it", async () => {
    const db = new FakeDb();
    const app = await insertApplication(db, "u1", base, "full raw JD text ...");
    expect(app.id).toBeTruthy();
    expect(app.company).toBe("Grab");
    expect("jdRaw" in app).toBe(false);
    expect(db.rows("applications")[0]?.jd_raw).toBe("full raw JD text ...");
  });

  it("getApplication round-trips; null when missing or another user's", async () => {
    const db = new FakeDb();
    const app = await insertApplication(db, "u1", base);
    expect((await getApplication(db, "u1", app.id))?.role).toBe("Senior PM");
    expect(await getApplication(db, "u1", "missing")).toBeNull();
    expect(await getApplication(db, "u2", app.id)).toBeNull();
  });

  it("updateApplication persists a stage change", async () => {
    const db = new FakeDb();
    const app = await insertApplication(db, "u1", base);
    const advanced: Application = {
      ...app,
      stage: "applied",
      appliedAt: "2026-08-30",
      updatedAt: "2026-08-30T00:00:00Z",
    };
    await updateApplication(db, "u1", advanced);
    const reread = await getApplication(db, "u1", app.id);
    expect(reread?.stage).toBe("applied");
    expect(reread?.appliedAt).toBe("2026-08-30");
  });

  it("listApplications returns only the user's rows, most recently updated first", async () => {
    const db = new FakeDb();
    await insertApplication(db, "u1", { ...base, company: "Old", updatedAt: "2026-08-01T00:00:00Z" });
    await insertApplication(db, "u1", { ...base, company: "New", updatedAt: "2026-08-28T00:00:00Z" });
    await insertApplication(db, "u2", { ...base, company: "Other" });
    const apps = await listApplications(db, "u1");
    expect(apps.map((a) => a.company)).toEqual(["New", "Old"]);
  });

  it("requests only posting IDs and text for the user's SQL-null extracts over PostgREST", async () => {
    const rows = [{ id: "unread", jd_raw: "Job posting" }, { id: "no-posting", jd_raw: null }];
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(rows));
    const db = asDbClient(createClient("https://supabase.example", "test-key", { global: { fetch } }));

    expect(await listUnextractedPostings(db, "u1")).toEqual(rows);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [request, init] = fetch.mock.calls[0]!;
    const url = new URL(String(request));
    expect(init?.method).toBe("GET");
    expect(url.pathname).toBe("/rest/v1/applications");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      select: "id,jd_raw",
      user_id: "eq.u1",
      jd_extract: "is.null",
      order: "updated_at.desc,id.asc",
      limit: "500",
      offset: "0",
    });
  });

  it("bounds the application list without requesting raw postings or cover letters", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json([]));
    const db = asDbClient(createClient("https://supabase.example", "test-key", { global: { fetch } }));

    await listApplications(db, "u1");
    const params = new URL(String(fetch.mock.calls[0]![0])).searchParams;
    expect(params.get("select")?.split(",")).toEqual([
      "id", "company", "role", "sector_id", "stage", "closed_reason", "jd_extract", "cv_id",
      "referral_contact_id", "next_action", "saved_at", "applied_at", "updated_at", "external_ref",
      "apply_url", "status_note", "company_id", "sourcing_kit",
    ]);
    expect(params.get("limit")).toBe("500");
    expect(params.get("order")).toBe("updated_at.desc,id.asc");
    expect(params.get("user_id")).toBe("eq.u1");
  });
});
