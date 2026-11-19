import { describe, it, expect } from "vitest";
import { VisitorStore, isVisitorId, newVisitorId } from "./visitors";

describe("VisitorStore", () => {
  it("gives each visitor their own copy and keeps it between requests", () => {
    let made = 0;
    const store = new VisitorStore(() => ({ n: ++made }), { ttlMs: 1000, max: 10 });
    expect(store.get("a", 0)).toBe(store.get("a", 10));
    expect(store.get("b", 20).n).toBe(2);
  });

  it("starts a visitor over after the idle time runs out", () => {
    let made = 0;
    const store = new VisitorStore(() => ({ n: ++made }), { ttlMs: 100, max: 10 });
    store.get("a", 0);
    expect(store.get("a", 50).n).toBe(1);
    expect(store.get("a", 200).n).toBe(2);
  });

  it("drops the longest-idle visitor when full, so memory stays bounded", () => {
    const store = new VisitorStore(() => ({}), { ttlMs: 10_000, max: 2 });
    store.get("a", 0);
    store.get("b", 1);
    store.get("a", 2);
    store.get("c", 3);
    expect(store.size).toBe(2);
    expect(store.has("b")).toBe(false);
  });
});

describe("visitor ids", () => {
  it("accepts only ids this code made", () => {
    expect(isVisitorId(newVisitorId())).toBe(true);
    expect(isVisitorId("../../etc")).toBe(false);
    expect(isVisitorId("")).toBe(false);
  });
});

describe("demoMaxVisitorsFromEnv", () => {
  it("is off when unset, a number when set, and loud when wrong", async () => {
    const { demoMaxVisitorsFromEnv } = await import("./visitors");
    expect(demoMaxVisitorsFromEnv({})).toBeUndefined();
    expect(demoMaxVisitorsFromEnv({ DEMO_MAX_VISITORS: "200" })).toBe(200);
    expect(() => demoMaxVisitorsFromEnv({ DEMO_MAX_VISITORS: "lots" })).toThrow();
  });
});
