import { describe, it, expect } from "vitest";
import { mapAdzunaResult } from "../adapters/adzuna";
import { FakeDb } from "./fake-db";
import { listSourcedJobs, setSourcedJobStatus, upsertSourcedJobs } from "./sourced-jobs";

const adzunaJob = mapAdzunaResult({
  id: "501",
  title: "Senior PM",
  company: { display_name: "Grab" },
  location: { display_name: "Singapore" },
  redirect_url: "https://example.com/501",
  created: "2026-08-28T02:11:00Z",
});

describe("sourced-jobs repo", () => {
  it("upsertSourcedJobs dedupes on (source, external_id): re-sourcing updates, never duplicates", async () => {
    const db = new FakeDb();
    await upsertSourcedJobs(db, "u1", [adzunaJob]);
    const rescored = { ...adzunaJob, score: 87 };
    const saved = await upsertSourcedJobs(db, "u1", [rescored]);
    expect(saved).toHaveLength(1);
    const all = await listSourcedJobs(db, "u1");
    expect(all).toHaveLength(1);
    expect(all[0]?.score).toBe(87);
  });

  it("listSourcedJobs filters by status and orders by score descending", async () => {
    const db = new FakeDb();
    await upsertSourcedJobs(db, "u1", [
      { ...adzunaJob, externalId: "1", score: 40 },
      { ...adzunaJob, externalId: "2", score: 90 },
      { ...adzunaJob, externalId: "3", score: 70, status: "dismissed" },
    ]);
    const fresh = await listSourcedJobs(db, "u1", "new");
    expect(fresh.map((j) => j.score)).toEqual([90, 40]);
  });

  it("setSourcedJobStatus moves a job between states", async () => {
    const db = new FakeDb();
    const [saved] = await upsertSourcedJobs(db, "u1", [adzunaJob]);
    await setSourcedJobStatus(db, "u1", saved!.id, "shortlisted");
    const shortlisted = await listSourcedJobs(db, "u1", "shortlisted");
    expect(shortlisted).toHaveLength(1);
  });
});
