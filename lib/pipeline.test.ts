import { describe, it, expect } from "vitest";
import { advance, canTransition, staleApplications, funnelStats } from "./pipeline";
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
