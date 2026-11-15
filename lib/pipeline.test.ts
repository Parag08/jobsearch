import { describe, it, expect } from "vitest";
import { advance, canTransition, staleApplications, funnelStats, recentApplications, byRecentActivity } from "./pipeline";
import type { Application } from "./types";

function app(over: Partial<Application> = {}): Application {
  return {
    id: "a1",
    company: "Grab",
    role: "PM",
    sectorId: null,
    stage: "saved",
    closedReason: null,
    jdExtract: null,
    cvVersionId: null,
    referralContactId: null,
    nextAction: null,
    savedAt: "2026-08-01",
    appliedAt: null,
    updatedAt: "2026-08-01",
    ...over,
  };
}

describe("canTransition", () => {
  it("allows moving forward and backward between open stages", () => {
    expect(canTransition("saved", "applied")).toBe(true);
    expect(canTransition("interview", "screening")).toBe(true);
  });
  it("allows jumping straight to closed from anywhere", () => {
    expect(canTransition("saved", "closed")).toBe(true);
    expect(canTransition("negotiation", "closed")).toBe(true);
  });
  it("refuses to leave closed", () => {
    expect(canTransition("closed", "applied")).toBe(false);
  });
});

describe("advance", () => {
  it("stamps appliedAt the first time an application reaches applied", () => {
    const a = advance(app(), "applied", "2026-08-10");
    expect(a.stage).toBe("applied");
    expect(a.appliedAt).toBe("2026-08-10");
  });
  it("does not overwrite appliedAt on a second pass through applied", () => {
    const a1 = advance(app(), "applied", "2026-08-10");
    const a2 = advance(advance(a1, "screening", "2026-08-12"), "applied", "2026-08-15");
    expect(a2.appliedAt).toBe("2026-08-10");
  });
  it("requires a closedReason when closing", () => {
    expect(() => advance(app(), "closed", "2026-08-10")).toThrow();
    const a = advance(app(), "closed", "2026-08-10", "withdrawn");
    expect(a.closedReason).toBe("withdrawn");
  });
  it("throws on an illegal transition", () => {
    const closed = advance(app(), "closed", "2026-08-10", "lost");
    expect(() => advance(closed, "applied", "2026-08-11")).toThrow();
  });
});

describe("staleApplications", () => {
  it("flags applications sitting in applied with no response for >= 14 days", () => {
    const stale = app({ id: "s", stage: "applied", appliedAt: "2026-08-01" });
    const fresh = app({ id: "f", stage: "applied", appliedAt: "2026-08-25" });
    const ids = staleApplications([stale, fresh], "2026-08-29").map((a) => a.id);
    expect(ids).toEqual(["s"]);
  });
});

describe("funnelStats", () => {
  it("computes stage counts and response rate (past screening / applied)", () => {
    const apps = [
      app({ id: "1", stage: "applied", appliedAt: "x" }),
      app({ id: "2", stage: "screening", appliedAt: "x" }),
      app({ id: "3", stage: "interview", appliedAt: "x" }),
      app({ id: "4", stage: "saved" }),
    ];
    const s = funnelStats(apps);
    expect(s.byStage.applied).toBe(1);
    expect(s.byStage.saved).toBe(1);
    expect(s.applied).toBe(3); // reached applied at some point
    expect(s.responseRate).toBeCloseTo(2 / 3);
  });
});

describe("recentApplications", () => {
  const today = "2026-11-14";
  const old = { savedAt: "2026-09-01", updatedAt: "2026-09-01" };

  it("keeps an application applied to within the window, and drops one that is older", () => {
    const inside = app({ id: "in", ...old, stage: "applied", appliedAt: "2026-11-07" });
    const outside = app({ id: "out", ...old, stage: "applied", appliedAt: "2026-11-06" });
    expect(recentApplications([inside, outside], today, 7).map((a) => a.id)).toEqual(["in"]);
  });

  it("keeps an old application that moved or was saved inside the window", () => {
    const moved = app({ id: "moved", savedAt: "2026-09-01", appliedAt: "2026-09-02", updatedAt: "2026-11-12T09:30:00+00:00", stage: "interview" });
    const saved = app({ id: "saved", savedAt: "2026-11-13", updatedAt: "2026-11-13" });
    const quiet = app({ id: "quiet", ...old });
    expect(recentApplications([moved, saved, quiet], today, 7).map((a) => a.id)).toEqual(["moved", "saved"]);
  });
});

describe("byRecentActivity", () => {
  it("orders newest activity first: the latest of applied, moved or saved", () => {
    const a = app({ id: "a", savedAt: "2026-11-01", updatedAt: "2026-11-01", appliedAt: null });
    const b = app({ id: "b", savedAt: "2026-10-01", updatedAt: "2026-11-12T08:00:00+00:00", appliedAt: "2026-10-02" });
    const c = app({ id: "c", savedAt: "2026-11-05", updatedAt: "2026-11-05", appliedAt: "2026-11-10" });
    expect(byRecentActivity([a, b, c]).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("does not reorder the list it was given", () => {
    const list = [app({ id: "old", savedAt: "2026-01-01", updatedAt: "2026-01-01" }), app({ id: "new", savedAt: "2026-11-01", updatedAt: "2026-11-01" })];
    byRecentActivity(list);
    expect(list.map((x) => x.id)).toEqual(["old", "new"]);
  });
});
