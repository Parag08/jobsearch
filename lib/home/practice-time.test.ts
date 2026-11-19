import { describe, it, expect } from "vitest";
import { attemptSeconds, caseSeconds, SPEAKING_WPM, CASE_IDLE_CAP_SECONDS } from "./practice-time";

describe("attemptSeconds", () => {
  it("uses the recorded duration when there is one", () => {
    expect(attemptSeconds({ durationSeconds: 95, transcript: "a b c" })).toBe(95);
  });
  it("without one, estimates from the words at a speaking pace", () => {
    const words = Array.from({ length: SPEAKING_WPM }, () => "word").join(" ");
    expect(attemptSeconds({ durationSeconds: null, transcript: words })).toBe(60);
    expect(attemptSeconds({ durationSeconds: null, transcript: "  " })).toBe(0);
  });
});

describe("caseSeconds", () => {
  it("adds the time between turns", () => {
    expect(caseSeconds(["2026-11-19T10:00:00Z", "2026-11-19T10:02:00Z", "2026-11-19T10:05:00Z"])).toBe(300);
  });
  it("a long pause counts only up to the idle cap, so a case left open overnight is not hours of practice", () => {
    expect(caseSeconds(["2026-11-19T10:00:00Z", "2026-11-20T09:00:00Z"])).toBe(CASE_IDLE_CAP_SECONDS);
  });
  it("one turn or none is no time", () => {
    expect(caseSeconds(["2026-11-19T10:00:00Z"])).toBe(0);
    expect(caseSeconds([])).toBe(0);
  });
});
