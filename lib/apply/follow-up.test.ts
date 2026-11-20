import { describe, it, expect } from "vitest";
import { applyFollowUpDaysFromEnv, followUpAfterApplying } from "./follow-up";

describe("applyFollowUpDaysFromEnv", () => {
  it("reads a whole number of days, or nothing when unset", () => {
    expect(applyFollowUpDaysFromEnv({ APPLY_FOLLOW_UP_DAYS: "7" })).toBe(7);
    expect(applyFollowUpDaysFromEnv({})).toBeUndefined();
  });
  it("refuses anything else", () => {
    expect(() => applyFollowUpDaysFromEnv({ APPLY_FOLLOW_UP_DAYS: "soon" })).toThrow(/APPLY_FOLLOW_UP_DAYS/);
    expect(() => applyFollowUpDaysFromEnv({ APPLY_FOLLOW_UP_DAYS: "0" })).toThrow();
  });
});

describe("followUpAfterApplying", () => {
  it("names the date to follow up by", () => {
    expect(followUpAfterApplying("2026-11-20", 7)).toBe("Follow up if no reply by 27 Nov");
    expect(followUpAfterApplying("2026-12-28", 7)).toBe("Follow up if no reply by 4 Jan 2027");
  });
});
