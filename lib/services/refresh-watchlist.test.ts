import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { insertApplication, type NewApplication } from "../repos/applications";
import { insertContact } from "../repos/contacts";
import { insertBullets, insertProject } from "../repos/projects";
import { saveSector } from "../repos/sectors";
import { listSourcedJobs, upsertSourcedJobs } from "../repos/sourced-jobs";
import { addWatchlistEntry } from "../repos/watchlist";
import { FakeBoardFetcher } from "../watchlist/fetcher";
import { newWatchlistEntry } from "../watchlist/types";
import { refreshWatchlist } from "./refresh-watchlist";

const TODAY = "2026-09-10";

const appliedTo: NewApplication = {
  company: "Acme Corp",
  role: "Head of Product",
  sectorId: null,
  stage: "closed",
  closedReason: "lost",
  jdExtract: null,
  cvVersionId: null,
  referralContactId: null,
  nextAction: null,
  savedAt: "2026-07-01",
  appliedAt: "2026-07-02",
  updatedAt: "2026-08-01T00:00:00Z",
};

/** Greenhouse board for Acme: 3 postings, one already applied to, one duplicated on Lever below. */
const acmeBoard = {
  jobs: [
    { id: 1, title: "Senior Product Manager, Platform", absolute_url: "https://boards.greenhouse.io/acmecorp/jobs/1?gh_src=x", location: { name: "Singapore" }, updated_at: "2026-09-01T00:00:00Z" },
    { id: 2, title: "Head of Product", absolute_url: "https://boards.greenhouse.io/acmecorp/jobs/2", location: { name: "Singapore" }, updated_at: "2026-09-01T00:00:00Z" },
    { id: 3, title: "Senior Associate, TIG", absolute_url: "https://boards.greenhouse.io/acmecorp/jobs/3", location: { name: "London" }, updated_at: "2026-09-01T00:00:00Z" },
  ],
};

/** Lever board for Beta: one posting whose hostedUrl is the SAME role as Acme job 1 (mirrored listing). */
const betaBoard = [
  { id: "b1", text: "Product Lead", hostedUrl: "https://jobs.lever.co/beta-labs/b1", categories: { location: "Singapore" }, createdAt: 1756684800000 },
  { id: "b2", text: "Mirror", hostedUrl: "https://boards.greenhouse.io/acmecorp/jobs/1/", categories: { location: "Singapore" }, createdAt: 1756684800000 },
];

async function seed(db: FakeDb) {
  const acme = await addWatchlistEntry(db, "u1", newWatchlistEntry("Acme Corp", "https://boards.greenhouse.io/acmecorp", TODAY));
  const beta = await addWatchlistEntry(db, "u1", newWatchlistEntry("Beta Labs", "https://jobs.lever.co/beta-labs", TODAY));
  const broken = await addWatchlistEntry(db, "u1", newWatchlistEntry("Gamma Inc", "https://jobs.ashbyhq.com/gamma", TODAY));
  const paused = await addWatchlistEntry(db, "u1", { ...newWatchlistEntry("Paused Co", "https://jobs.lever.co/paused", TODAY), active: false });
  await insertApplication(db, "u1", appliedTo);
  const project = await insertProject(db, "u1", { name: "P", org: "Prev Co", dates: null, role: null, narrative: "", outcomes: [], skills: [], sectorTags: [] });
  await insertBullets(db, "u1", project.id, [{ roleFamily: "product-management", text: "Shipped the platform roadmap", skills: ["product", "roadmap"] }]);
  await saveSector(db, "u1", { id: "s", path: ["IT", "AI", "Singapore"], skills: {}, companies: [], titles: [], jdCount: 1, summary: "" });
  return { acme, beta, broken, paused };
}

describe("refreshWatchlist", () => {
  it("fetches every active board, dedupes across sources, skips the pipeline, scores and upserts", async () => {
    const db = new FakeDb();
    const { acme, beta, broken, paused } = await seed(db);
    const fetcher = new FakeBoardFetcher({ [acme.id]: acmeBoard, [beta.id]: betaBoard }, { [broken.id]: "HTTP 500" });

    const result = await refreshWatchlist({ db, fetcher }, "u1", TODAY);

    expect(fetcher.calls.map((e) => e.id).sort()).toEqual([acme.id, beta.id, broken.id].sort());
    expect(fetcher.calls.map((e) => e.id)).not.toContain(paused.id);
    expect(result).toMatchObject({ fetched: 5, deduped: 1, excluded: 1, upserted: 3 });
    expect(result.failures).toEqual([{ entryId: broken.id, company: "Gamma Inc", error: "HTTP 500" }]);

    const stored = await listSourcedJobs(db, "u1");
    expect(stored.map((j) => j.title).sort()).toEqual(["Product Lead", "Senior Associate, TIG", "Senior Product Manager, Platform"]);
    expect(stored.every((j) => typeof j.score === "number")).toBe(true);
    // target-company boost: every stored job is at a watchlist company, so all clear the boost floor
    expect(Math.min(...stored.map((j) => j.score!))).toBeGreaterThanOrEqual(45);
    // and the title-overlap job at the target company outranks the zero-overlap one
    const byTitle = Object.fromEntries(stored.map((j) => [j.title, j.score]));
    expect(byTitle["Senior Product Manager, Platform"]).toBeGreaterThan(byTitle["Senior Associate, TIG"]!);
  });

  it("one failing board never aborts the others, and all-failing yields zero counts with every failure listed", async () => {
    const db = new FakeDb();
    const { acme, beta, broken } = await seed(db);
    const fetcher = new FakeBoardFetcher({}, { [acme.id]: "a", [beta.id]: "b", [broken.id]: "c" });
    const result = await refreshWatchlist({ db, fetcher }, "u1", TODAY);
    expect(result).toMatchObject({ fetched: 0, deduped: 0, excluded: 0, upserted: 0 });
    expect(result.failures.map((f) => f.error).sort()).toEqual(["a", "b", "c"]);
    expect(await listSourcedJobs(db, "u1")).toEqual([]);
  });

  it("re-running is idempotent: the same postings update in place, never duplicate", async () => {
    const db = new FakeDb();
    const { acme } = await seed(db);
    const fetcher = new FakeBoardFetcher({ [acme.id]: acmeBoard });
    await refreshWatchlist({ db, fetcher }, "u1", TODAY);
    const again = await refreshWatchlist({ db, fetcher }, "u1", TODAY);
    expect(again.upserted).toBe(2);
    expect(await listSourcedJobs(db, "u1")).toHaveLength(2);
  });

  it("boosts with the network signal too, and works with no sector node (neutral node)", async () => {
    const db = new FakeDb();
    const acme = await addWatchlistEntry(db, "u1", newWatchlistEntry("Acme Corp", "https://boards.greenhouse.io/acmecorp", TODAY));
    await insertContact(db, "u1", { name: "Friend", network: null, company: "Acme Corp", role: null, location: null, warmth: "warm", status: "met", interests: [], nextFollowup: null });
    const fetcher = new FakeBoardFetcher({ [acme.id]: { jobs: [acmeBoard.jobs[2]] } });
    const result = await refreshWatchlist({ db, fetcher }, "u1", TODAY);
    expect(result.upserted).toBe(1);
    const [job] = await listSourcedJobs(db, "u1");
    expect(job!.score).toBe(45 + 30); // declared target + a contact at the company; no sector, no title, no geo
  });

  it("does not disturb jobs sourced by other feeds (adzuna rows stay untouched)", async () => {
    const db = new FakeDb();
    const { acme } = await seed(db);
    await upsertSourcedJobs(db, "u1", [{ source: "adzuna", externalId: "z1", title: "Other", company: "Elsewhere", location: null, url: null, postedAt: null, score: 10, status: "new" }]);
    await refreshWatchlist({ db, fetcher: new FakeBoardFetcher({ [acme.id]: acmeBoard }) }, "u1", TODAY);
    const adzuna = (await listSourcedJobs(db, "u1")).filter((j) => j.source === "adzuna");
    expect(adzuna).toHaveLength(1);
    expect(adzuna[0]?.score).toBe(10);
  });
});
