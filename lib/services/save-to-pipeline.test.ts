import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { FakeLlm } from "../adapters/llm";
import { listApplications, getJdRaw } from "../repos/applications";
import { listSourcedJobs } from "../repos/sourced-jobs";
import { saveToPipeline, sourcedRef } from "./save-to-pipeline";

const NOW = "2026-11-20T09:00:00Z";
const U = "u1";

function setup(readText: string | null = "Senior PM\nCompany: Kestrel AI\n\nOwn the payments roadmap in Singapore.") {
  const db = new FakeDb();
  db.seed("watchlist", [
    { user_id: U, company: "Kestrel AI", careers_url: "https://boards.greenhouse.io/kestrel", ats: "greenhouse", token: "kestrel", active: true, added_at: "2026-11-01" },
  ]);
  db.seed("sourced_jobs", [
    { id: "job-1", user_id: U, source: "greenhouse", external_id: "777", title: "Senior PM", company: "Kestrel AI", location: "Singapore", url: "https://boards.greenhouse.io/kestrel/jobs/777", posted_at: "2026-11-19", score: 80, status: "new" },
    { id: "job-2", user_id: U, source: "lever", external_id: "abc", title: "PM", company: "Nobody Watched", location: null, url: "https://jobs.lever.co/x/abc", posted_at: null, score: null, status: "new" },
  ]);
  const llm = new FakeLlm();
  llm.stubJdExtract({
    company: "Kestrel AI",
    role: "Senior PM",
    roleFamily: "product-management",
    sectorPath: ["Product", "Singapore"],
    skills: ["roadmap"],
    keywords: [],
    seniority: "senior",
    visaNote: null,
    location: "Singapore",
  });
  const reads: { ats: string; token: string; externalId: string }[] = [];
  const built: string[] = [];
  const deps = {
    db,
    llm,
    readPosting: async (q: { ats: string; token: string; externalId: string; company: string }) => {
      reads.push(q);
      return readText;
    },
    buildCv: async (id: string) => {
      built.push(id);
    },
  };
  return { db, llm, deps, reads, built };
}

describe("saveToPipeline", () => {
  it("reads the posting from its board, opens an application, builds the CV and marks the role tracked", async () => {
    const { db, deps, reads, built } = setup();
    const r = await saveToPipeline(deps, U, "job-1", NOW);
    expect("applicationId" in r && r.created).toBe(true);
    expect(reads).toEqual([{ ats: "greenhouse", token: "kestrel", externalId: "777", company: "Kestrel AI" }]);

    const [app] = await listApplications(db, U);
    expect(app.company).toBe("Kestrel AI");
    expect(app.stage).toBe("saved");
    expect(app.externalRef).toBe(sourcedRef("job-1"));
    expect(app.applyUrl).toBe("https://boards.greenhouse.io/kestrel/jobs/777");
    expect(await getJdRaw(db, U, app.id)).toContain("payments roadmap");
    expect(built).toEqual([app.id]);
    expect((await listSourcedJobs(db, U)).find((j) => j.id === "job-1")?.status).toBe("tracked");
  });

  it("is idempotent: a second save opens the same application and reads nothing", async () => {
    const { db, deps, reads } = setup();
    const first = await saveToPipeline(deps, U, "job-1", NOW);
    const again = await saveToPipeline(deps, U, "job-1", NOW);
    expect(again).toEqual({ applicationId: (first as { applicationId: string }).applicationId, created: false });
    expect(reads).toHaveLength(1);
    expect(await listApplications(db, U)).toHaveLength(1);
  });

  it("asks for a paste when the board gives no text, and changes nothing", async () => {
    const { db, deps, llm } = setup(null);
    expect(await saveToPipeline(deps, U, "job-1", NOW)).toEqual({ needsPosting: true, url: "https://boards.greenhouse.io/kestrel/jobs/777" });
    expect(llm.calls).toHaveLength(0);
    expect(await listApplications(db, U)).toHaveLength(0);
  });

  it("asks for a paste when the company is not on a readable watchlist board", async () => {
    const { deps, reads } = setup();
    expect(await saveToPipeline(deps, U, "job-2", NOW)).toEqual({ needsPosting: true, url: "https://jobs.lever.co/x/abc" });
    expect(reads).toHaveLength(0);
  });

  it("keeps the application when the CV cannot be built yet", async () => {
    const { db, deps } = setup();
    const r = await saveToPipeline({ ...deps, buildCv: async () => { throw new Error("no master CV"); } }, U, "job-1", NOW);
    expect(r).toMatchObject({ created: true, cvError: "no master CV" });
    expect(await listApplications(db, U)).toHaveLength(1);
  });

  it("rejects a role that is not the user's", async () => {
    const { deps } = setup();
    await expect(saveToPipeline(deps, "someone-else", "job-1", NOW)).rejects.toThrow(/not found/);
  });
});
