import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { insertApplication, type NewApplication } from "../repos/applications";
import { insertContact } from "../repos/contacts";
import { getBrief } from "../repos/briefs";
import { upsertSourcedJobs } from "../repos/sourced-jobs";
import { generateBrief } from "./daily-brief";

const TODAY = "2026-08-29";

const baseApp: NewApplication = {
  company: "Grab",
  role: "Senior PM",
  sectorId: null,
  stage: "applied",
  closedReason: null,
  jdExtract: null,
  cvVersionId: null,
  referralContactId: null,
  nextAction: null,
  savedAt: "2026-08-01",
  appliedAt: "2026-08-01",
  updatedAt: "2026-08-01T00:00:00Z", // 28 days ago -> stale
};

const contact = {
  name: "Priya",
  network: null,
  company: "Grab",
  role: "Director",
  location: "Singapore",
  warmth: "warm" as const,
  status: "in-conversation" as const,
  interests: [],
  nextFollowup: "2026-08-28", // due
};

describe("generateBrief", () => {
  it("composes due follow-ups, stale applications, and top sourced jobs, then persists one brief per day", async () => {
    const db = new FakeDb();
    await insertContact(db, "u1", contact);
    await insertContact(db, "u1", { ...contact, name: "Later", nextFollowup: "2026-09-15" });
    await insertApplication(db, "u1", baseApp);
    await insertApplication(db, "u1", { ...baseApp, company: "Fresh", appliedAt: "2026-08-28", updatedAt: "2026-08-28T00:00:00Z" });
    await upsertSourcedJobs(db, "u1", [
      { source: "adzuna", externalId: "1", title: "PM", company: "Sea", location: null, url: "https://j.test/1", postedAt: null, score: 92, status: "new" },
      { source: "adzuna", externalId: "2", title: "APM", company: "Shopee", location: null, url: null, postedAt: null, score: 40, status: "dismissed" },
    ]);

    const brief = await generateBrief({ db }, "u1", TODAY);

    expect(brief.date).toBe(TODAY);
    const titles = brief.items.map((i) => i.title).join(" | ");
    expect(titles).toContain("Priya");
    expect(titles).not.toContain("Later");
    expect(titles).toContain("Grab");
    expect(titles).not.toContain("Fresh");
    expect(titles).toContain("PM");
    expect(titles).not.toContain("APM"); // dismissed jobs stay out
    expect(await getBrief(db, "u1", TODAY)).toEqual(brief); // persisted

    const regenerated = await generateBrief({ db }, "u1", TODAY);
    expect((await getBrief(db, "u1", TODAY))?.items).toEqual(regenerated.items); // one per day
  });

  it("produces an empty brief when nothing is due", async () => {
    const db = new FakeDb();
    const brief = await generateBrief({ db }, "u1", TODAY);
    expect(brief.items).toEqual([]);
  });
});
