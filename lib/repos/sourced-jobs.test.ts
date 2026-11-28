import { describe, it, expect, vi } from "vitest";
import { mapAdzunaResult } from "../adapters/adzuna";
import { FakeDb } from "./fake-db";
import { applyRetirement, listSourcedJobs, setSourcedJobStatus, upsertSourcedJobs } from "./sourced-jobs";

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

  it("applies distinct retirement updates in one write without changing stale or unowned rows", async () => {
    const db = new FakeDb();
    const board = "https://example.com/board";
    db.seed("sourced_jobs", [
      { id: "close", user_id: "u1", status: "new", missed_refreshes: 1, sourcing_board_url: board },
      { id: "reopen", user_id: "u1", status: "closed", missed_refreshes: 2, sourcing_board_url: null },
      { id: "changed-status", user_id: "u1", status: "tracked", missed_refreshes: 1, sourcing_board_url: board },
      { id: "changed-board", user_id: "u1", status: "new", missed_refreshes: 1, sourcing_board_url: board },
      { id: "no-prior", user_id: "u1", status: "new", missed_refreshes: 1 },
      { id: "unowned", user_id: "u2", status: "new", missed_refreshes: 1, sourcing_board_url: board },
    ]);
    const rpc = vi.spyOn(db, "rpc");
    await applyRetirement(db, "u1", [
      { id: "close", status: "closed", missedRefreshes: 2, sourcingBoardUrl: board },
      { id: "reopen", status: "new", missedRefreshes: 0 },
      { id: "changed-status", status: "closed", missedRefreshes: 2, sourcingBoardUrl: board },
      { id: "changed-board", status: "closed", missedRefreshes: 2 },
      { id: "no-prior", status: "closed", missedRefreshes: 2 },
      { id: "unowned", status: "closed", missedRefreshes: 2, sourcingBoardUrl: board },
    ], new Map([
      ["close", "new"], ["reopen", "closed"], ["changed-status", "new"], ["changed-board", "new"], ["unowned", "new"],
    ]));

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(db.rows("sourced_jobs").map((r) => [r.id, r.status, r.missed_refreshes])).toEqual([
      ["close", "closed", 2], ["reopen", "new", 0], ["changed-status", "tracked", 1],
      ["changed-board", "new", 1], ["no-prior", "new", 1], ["unowned", "new", 1],
    ]);
    rpc.mockClear();
    await applyRetirement(db, "u1", [], new Map([["close", "closed"]]));
    await applyRetirement(db, "u1", [{ id: "no-prior", status: "closed", missedRefreshes: 2 }], new Map());
    expect(rpc).not.toHaveBeenCalled();
  });
});
