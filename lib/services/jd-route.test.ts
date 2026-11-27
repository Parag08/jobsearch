import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { FakeLlm } from "../adapters/llm";
import { listApplications } from "../repos/applications";

const state = vi.hoisted(() => ({ db: null as unknown, llm: null as unknown }));

vi.mock("@/lib/db", () => ({ getWorkspace: async () => ({ db: state.db, userId: "u1", mode: "live" }) }));
vi.mock("@/lib/services/settings", () => ({ envFor: async () => ({}) }));
vi.mock("@/lib/services/ai-write", () => ({ aiLlm: () => state.llm }));
vi.mock("@/lib/adapters/llm-factory", () => ({ withLedger: (llm: unknown) => llm }));
vi.mock("@/lib/db/demo", () => ({ demoTaxonomy: () => ({ tags: {} }) }));

import { POST } from "@/app/api/jd/route";

function post(jd: string) {
  return POST(new Request("http://localhost/api/jd", { method: "POST", body: JSON.stringify({ jd }) }));
}

describe("POST /api/jd", () => {
  let db: FakeDb;
  let llm: FakeLlm;
  beforeEach(() => {
    db = new FakeDb();
    llm = new FakeLlm();
    llm.stubJdExtract({
      company: "Grab", role: "PM", roleFamily: "product-management", sectorPath: ["IT"], skills: [], keywords: [],
      seniority: "senior", visaNote: null, location: "Singapore",
    });
    state.db = db;
    state.llm = llm;
  });

  it("rejects a 100,000-character posting with 413 and never calls the model", async () => {
    const res = await post("x".repeat(100_000));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/too long/);
    expect(llm.calls).toHaveLength(0);
    expect(await listApplications(db, "u1")).toHaveLength(0);
  });

  it("still reads a normal posting", async () => {
    const res = await post("Senior PM at Grab, owning the AI roadmap in Singapore. ".repeat(3));
    expect(res.status).toBe(201);
    expect(llm.calls).toHaveLength(1);
  });
});
