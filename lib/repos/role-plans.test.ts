import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { getRolePlan, saveRolePlan, type StoredRolePlan } from "./role-plans";

const plan = (over: Partial<StoredRolePlan> = {}): StoredRolePlan => ({
  roleFamily: "strategy",
  text: "Build a pricing model.\nShip one case study.",
  gaps: ["pricing", "sql"],
  rolesSeen: 12,
  model: "m1",
  generatedAt: "2026-11-14T08:00:00.000Z",
  ...over,
});

describe("role plans", () => {
  it("is null when nothing is stored", async () => {
    expect(await getRolePlan(new FakeDb(), "u1", "strategy")).toBeNull();
  });

  it("saves then reads a plan back", async () => {
    const db = new FakeDb();
    const saved = await saveRolePlan(db, "u1", plan());
    expect(saved).toEqual(plan());
    expect(await getRolePlan(db, "u1", "strategy")).toEqual(plan());
  });

  it("replaces the plan for the same family: one row", async () => {
    const db = new FakeDb();
    await saveRolePlan(db, "u1", plan());
    await saveRolePlan(db, "u1", plan({ text: "New plan", rolesSeen: 20, model: null }));
    expect(db.rows("role_plans")).toHaveLength(1);
    const got = await getRolePlan(db, "u1", "strategy");
    expect(got?.text).toBe("New plan");
    expect(got?.rolesSeen).toBe(20);
    expect(got?.model).toBeNull();
  });

  it("keeps different families separate", async () => {
    const db = new FakeDb();
    await saveRolePlan(db, "u1", plan());
    await saveRolePlan(db, "u1", plan({ roleFamily: "product", text: "Other" }));
    expect(db.rows("role_plans")).toHaveLength(2);
    expect((await getRolePlan(db, "u1", "product"))?.text).toBe("Other");
    expect((await getRolePlan(db, "u1", "strategy"))?.text).toContain("pricing");
  });

  it("never returns another user's plan", async () => {
    const db = new FakeDb();
    await saveRolePlan(db, "u1", plan());
    expect(await getRolePlan(db, "u2", "strategy")).toBeNull();
    await saveRolePlan(db, "u2", plan({ text: "Mine" }));
    expect(db.rows("role_plans")).toHaveLength(2);
    expect((await getRolePlan(db, "u1", "strategy"))?.text).toContain("pricing");
  });

  it("is null when the stored JSON does not parse", async () => {
    const db = new FakeDb();
    db.seed("role_plans", [{ user_id: "u1", role_family: "strategy", plan: { nope: 1 } }]);
    expect(await getRolePlan(db, "u1", "strategy")).toBeNull();
  });
});
