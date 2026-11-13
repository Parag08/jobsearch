import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { listApplications } from "../repos/applications";
import { listContacts, listInteractions } from "../repos/contacts";
import { logInteraction, setStage, upsertApplication, upsertContact } from "./agent-sync";

const USER = "user-1";
const OTHER = "user-2";
const TODAY = "2026-11-13";

describe("upsertApplication", () => {
  it("creates in saved, then the same externalRef updates the same row", async () => {
    const db = new FakeDb();
    const first = await upsertApplication({ db }, USER, { externalRef: "acme-pm", company: "Acme", role: "PM", jdRaw: "the jd", applyUrl: "https://acme.test/1", savedAt: "2026-10-01" }, TODAY);
    expect(first.created).toBe(true);
    expect(first.record.stage).toBe("saved");
    expect(first.record.savedAt).toBe("2026-10-01");
    expect(first.record.applyUrl).toBe("https://acme.test/1");

    const again = await upsertApplication({ db }, USER, { externalRef: "acme-pm", company: "Acme", role: "Senior PM" }, TODAY);
    expect(again.created).toBe(false);
    expect(again.record.id).toBe(first.record.id);
    expect(again.record.role).toBe("Senior PM");
    expect(await listApplications(db, USER)).toHaveLength(1);
    expect(db.rows("applications")[0].jd_raw).toBe("the jd");
  });

  it("adopts a hand-made row for the same company and role instead of duplicating it", async () => {
    const db = new FakeDb();
    const byHand = await upsertApplication({ db }, USER, { company: "Bain & Company", role: "Consultant" }, TODAY);
    const synced = await upsertApplication({ db }, USER, { externalRef: "bain-consultant", company: "bain &  company", role: "consultant" }, TODAY);
    expect(synced.created).toBe(false);
    expect(synced.record.id).toBe(byHand.record.id);
    expect(synced.record.externalRef).toBe("bain-consultant");
  });

  it("never moves a stage, and never crosses users", async () => {
    const db = new FakeDb();
    await upsertApplication({ db }, USER, { externalRef: "x", company: "Acme", role: "PM" }, TODAY);
    await setStage({ db }, USER, { externalRef: "x", stage: "applied", date: "2026-11-04", evidence: "confirmed by the user" });
    const again = await upsertApplication({ db }, USER, { externalRef: "x", company: "Acme", role: "PM", nextAction: "follow up" }, TODAY);
    expect(again.record.stage).toBe("applied");
    expect(again.record.nextAction).toBe("follow up");

    const other = await upsertApplication({ db }, OTHER, { externalRef: "x", company: "Acme", role: "PM" }, TODAY);
    expect(other.created).toBe(true);
    expect(await listApplications(db, USER)).toHaveLength(1);
  });
});

describe("setStage", () => {
  it("stamps the event date, keeps the evidence, and is idempotent", async () => {
    const db = new FakeDb();
    await upsertApplication({ db }, USER, { externalRef: "x", company: "Acme", role: "PM" }, TODAY);
    const r = await setStage({ db }, USER, { externalRef: "x", stage: "applied", date: "2026-11-04", evidence: "Gmail receipt 2026-11-03" });
    expect(r.moved).toBe(true);
    expect(r.application.appliedAt).toBe("2026-11-04");
    expect(r.application.statusNote).toBe("applied 2026-11-04: Gmail receipt 2026-11-03");

    const again = await setStage({ db }, USER, { externalRef: "x", stage: "applied", date: "2026-11-04", evidence: "Gmail receipt 2026-11-03" });
    expect(again.moved).toBe(false);
    expect(again.application.appliedAt).toBe("2026-11-04");
  });

  it("refuses a stage without evidence or a real date, and a close without a reason", async () => {
    const db = new FakeDb();
    await upsertApplication({ db }, USER, { externalRef: "x", company: "Acme", role: "PM" }, TODAY);
    await expect(setStage({ db }, USER, { externalRef: "x", stage: "applied", date: "2026-11-04", evidence: "  " })).rejects.toThrow(/evidence/);
    await expect(setStage({ db }, USER, { externalRef: "x", stage: "applied", date: "4 Nov", evidence: "said so" })).rejects.toThrow(/ISO date/);
    await expect(setStage({ db }, USER, { externalRef: "x", stage: "closed", date: "2026-11-10", evidence: "rejection email" })).rejects.toThrow(/closedReason/);
    const closed = await setStage({ db }, USER, { externalRef: "x", stage: "closed", date: "2026-11-10", evidence: "rejection email", closedReason: "lost" });
    expect(closed.application.closedReason).toBe("lost");
  });

  it("cannot reach another user's application", async () => {
    const db = new FakeDb();
    const mine = await upsertApplication({ db }, USER, { externalRef: "x", company: "Acme", role: "PM" }, TODAY);
    await expect(setStage({ db }, OTHER, { id: mine.record.id, stage: "applied", date: "2026-11-04", evidence: "x" })).rejects.toThrow(/No application/);
  });
});

describe("contacts", () => {
  it("upserts by externalRef, merging only the fields given", async () => {
    const db = new FakeDb();
    const a = await upsertContact({ db }, USER, { externalRef: "li:jane", name: "Jane Tan", company: "Grab", role: "TPM", warmth: "warm" });
    expect(a.created).toBe(true);
    const b = await upsertContact({ db }, USER, { externalRef: "li:jane", name: "Jane Tan", status: "awaiting-reply" });
    expect(b.created).toBe(false);
    expect(b.record.company).toBe("Grab");
    expect(b.record.warmth).toBe("warm");
    expect(b.record.status).toBe("awaiting-reply");
    expect(await listContacts(db, USER)).toHaveLength(1);
  });

  it("logs an interaction once, however often the sync re-runs", async () => {
    const db = new FakeDb();
    const c = await upsertContact({ db }, USER, { externalRef: "li:jane", name: "Jane Tan" });
    const i = { date: "2026-10-28", channel: "linkedin" as const, summary: "Connection note sent" };
    expect((await logInteraction({ db }, USER, { externalRef: "li:jane" }, i)).created).toBe(true);
    expect((await logInteraction({ db }, USER, { externalRef: "li:jane" }, i)).created).toBe(false);
    expect(await listInteractions(db, USER, c.record.id)).toHaveLength(1);
    await expect(logInteraction({ db }, OTHER, { externalRef: "li:jane" }, i)).rejects.toThrow(/No contact/);
  });
});
