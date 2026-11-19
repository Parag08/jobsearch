import { describe, it, expect } from "vitest";
import { caseElapsedSeconds, caseProgress } from "./case-progress";

const turn = (at: string) => ({ role: "interviewer" as const, text: "", at });

describe("caseElapsedSeconds", () => {
  const turns = [turn("2026-11-19T10:00:00.000Z"), turn("2026-11-19T10:12:30.000Z")];

  it("counts from the first turn while the case is running", () => {
    expect(caseElapsedSeconds({ status: "running", turns }, Date.parse("2026-11-19T10:20:00.000Z"))).toBe(1200);
  });

  it("stops at the last turn once the case is done, however much later you look", () => {
    expect(caseElapsedSeconds({ status: "done", turns }, Date.parse("2026-11-22T09:00:00.000Z"))).toBe(750);
  });

  it("never runs backwards on a clock skew", () => {
    expect(caseElapsedSeconds({ status: "running", turns }, Date.parse("2026-11-19T09:59:00.000Z"))).toBe(0);
  });
});

describe("caseProgress", () => {
  const s = (caseId: string, status: "running" | "done", overall: number | null) => ({ caseId, status, overall });

  it("best score and attempts count finished, scored attempts only", () => {
    const p = caseProgress([s("a", "done", 3.5), s("a", "running", null), s("a", "done", 4), s("b", "running", null)]);
    expect(p.get("a")).toEqual({ best: 4, finished: 2, running: true });
    expect(p.get("b")).toEqual({ best: null, finished: 0, running: true });
    expect(p.has("c")).toBe(false);
  });

  it("a finished attempt that was never scored is not an attempt and not in progress", () => {
    expect(caseProgress([s("a", "done", null)]).get("a")).toEqual({ best: null, finished: 0, running: false });
  });
});
