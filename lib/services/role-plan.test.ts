import { describe, it, expect } from "vitest";
import { FakeLlm } from "../adapters/llm";
import { FakeDb } from "../repos/fake-db";
import { getRolePlan } from "../repos/role-plans";
import { upsertApplication } from "./agent-sync";
import { draftRolePlan, planKey } from "./role-plan";

const USER = "user-1";
const TODAY = "2026-11-14";

async function withRoles() {
  const db = new FakeDb();
  const llm = new FakeLlm();
  llm.stubJdExtract({
    company: "Palantir", role: "Forward Deployed Engineer", roleFamily: "forward-deployed-engineering", sectorPath: ["IT"],
    skills: ["python", "sql"], keywords: [], seniority: null, visaNote: null, location: null,
  });
  for (const c of ["A", "B"]) await upsertApplication({ db, llm }, USER, { company: c, role: "FDE", jdRaw: "Forward deployed engineer posting text" }, TODAY);
  return db;
}

describe("draftRolePlan", () => {
  it("writes the plan from the gaps and stores it under the selection", async () => {
    const db = await withRoles();
    const prompts: string[] = [];
    const by = { family: "forward-deployed-engineering" };
    const plan = await draftRolePlan({ db, write: async (p) => (prompts.push(p), " python: build a small tool. "), model: "m", maxGaps: 5 }, USER, by, TODAY);
    expect(plan).toMatchObject({ roleFamily: "forward-deployed-engineering", text: "python: build a small tool.", gaps: ["python", "sql"], rolesSeen: 2, model: "m" });
    expect(prompts[0]).toContain("python (asked by 100% of roles");
    expect(await getRolePlan(db, USER, planKey(by))).toMatchObject({ rolesSeen: 2 });
  });

  it("makes no model call when there is nothing to plan", async () => {
    const db = await withRoles();
    let calls = 0;
    const r = await draftRolePlan({ db, write: async () => (calls++, "x"), maxGaps: 5 }, USER, { family: "product-management" }, TODAY);
    expect(r).toEqual({ needs: "gaps" });
    expect(calls).toBe(0);
  });
});

describe("planKey", () => {
  it("keys a plan by family, title words, or both", () => {
    expect(planKey({ family: "product-management" })).toBe("product-management");
    expect(planKey({ title: "Forward Deployed" })).toBe("title:forward deployed");
    expect(planKey({ family: "engineering", title: "fde" })).toBe("engineering title:fde");
  });
});
