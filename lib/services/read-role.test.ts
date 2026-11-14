import { describe, it, expect } from "vitest";
import { FakeLlm } from "../adapters/llm";
import type { JdExtract } from "../types";
import { FakeDb } from "../repos/fake-db";
import { getApplication, listApplications } from "../repos/applications";
import { listSectors } from "../repos/sectors";
import { upsertApplication } from "./agent-sync";
import { readRole, readUnreadRoles } from "./read-role";

const USER = "user-1";
const TODAY = "2026-11-14";
const POSTING = "Forward Deployed Engineer: work with customers to deploy our platform and migrate workloads.";

const extract: JdExtract = {
  company: "Palantir Technologies",
  role: "Forward Deployed Software Engineer",
  roleFamily: "forward-deployed-engineering",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["python", "customer deployment"],
  keywords: ["ontology"],
  seniority: "mid",
  visaNote: null,
  location: "Singapore",
};

function fixtures() {
  const db = new FakeDb();
  const llm = new FakeLlm();
  llm.stubJdExtract(extract);
  return { db, llm };
}

describe("upsertApplication with a reader", () => {
  it("reads the posting into skills once, keeping the company and role the agent gave", async () => {
    const { db, llm } = fixtures();
    const r = await upsertApplication({ db, llm }, USER, { externalRef: "pltr-fde", company: "Palantir", role: "FDE, Singapore", jdRaw: POSTING }, TODAY);
    expect(r.read).toEqual({ ok: true });
    expect(r.record.company).toBe("Palantir");
    expect(r.record.role).toBe("FDE, Singapore");
    expect(r.record.jdExtract?.roleFamily).toBe("forward-deployed-engineering");
    expect(r.record.jdExtract?.skills).toEqual(["python", "customer deployment"]);
    expect(r.record.jdExtract?.signals?.tokens).toContain("workloads");
    expect(r.record.sectorId).toBe((await listSectors(db, USER))[0]!.id);

    // The same role again: already read, so no second model call.
    await upsertApplication({ db, llm }, USER, { externalRef: "pltr-fde", company: "Palantir", role: "FDE, Singapore", jdRaw: POSTING }, TODAY);
    expect(llm.calls).toHaveLength(1);
  });

  it("still saves the role when the reader fails, and says so", async () => {
    const db = new FakeDb();
    const llm = new FakeLlm(); // nothing stubbed: extractJd throws
    const r = await upsertApplication({ db, llm }, USER, { company: "Acme", role: "PM", jdRaw: POSTING }, TODAY);
    expect(r.created).toBe(true);
    expect(r.read?.ok).toBe(false);
    expect(r.record.jdExtract).toBeNull();
    expect(db.rows("applications")[0]!.jd_raw).toBe(POSTING);
  });

  it("does not read without posting text, or without a reader", async () => {
    const { db, llm } = fixtures();
    const noText = await upsertApplication({ db, llm }, USER, { company: "Acme", role: "PM" }, TODAY);
    const noReader = await upsertApplication({ db }, USER, { company: "Beta", role: "PM", jdRaw: POSTING }, TODAY);
    expect(noText.read).toBeUndefined();
    expect(noReader.read).toBeUndefined();
    expect(llm.calls).toHaveLength(0);
  });
});

describe("readRole", () => {
  it("fills in an application that has posting text and no extract", async () => {
    const { db, llm } = fixtures();
    const { record } = await upsertApplication({ db }, USER, { company: "Palantir", role: "FDE", jdRaw: POSTING }, TODAY);
    const read = await readRole({ db, llm }, USER, record.id);
    expect(read?.jdExtract?.skills).toContain("python");
    expect((await getApplication(db, USER, record.id))?.jdExtract?.roleFamily).toBe("forward-deployed-engineering");
  });

  it("returns null when there is no posting text to read", async () => {
    const { db, llm } = fixtures();
    const { record } = await upsertApplication({ db }, USER, { company: "Palantir", role: "FDE" }, TODAY);
    expect(await readRole({ db, llm }, USER, record.id)).toBeNull();
    expect(llm.calls).toHaveLength(0);
  });
});

describe("readUnreadRoles", () => {
  it("reads up to the batch size and reports what is left", async () => {
    const { db, llm } = fixtures();
    for (const c of ["A", "B", "C"]) await upsertApplication({ db }, USER, { company: c, role: "FDE", jdRaw: POSTING }, TODAY);
    await upsertApplication({ db }, USER, { company: "NoText", role: "FDE" }, TODAY);

    const first = await readUnreadRoles({ db, llm }, USER, 2);
    expect(first).toEqual({ read: 2, failed: 0, remaining: 1 });
    const second = await readUnreadRoles({ db, llm }, USER, 2);
    expect(second).toEqual({ read: 1, failed: 0, remaining: 0 });
    expect((await listApplications(db, USER)).filter((a) => a.jdExtract).length).toBe(3);
  });
});
