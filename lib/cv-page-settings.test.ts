import { describe, it, expect } from "vitest";
import { cvPageSettingsFromEnv } from "./cv-page-settings";

describe("cvPageSettingsFromEnv", () => {
  it("reads page size, scale and overhead lines", () => {
    expect(cvPageSettingsFromEnv({ CV_PAGE_SIZE: "A4", CV_SCALE: "0.95", CV_OVERHEAD_LINES: "18" })).toEqual({
      pageSize: "A4",
      scale: 0.95,
      overheadLines: 18,
    });
    expect(cvPageSettingsFromEnv({ CV_PAGE_SIZE: "Letter", CV_SCALE: "1", CV_OVERHEAD_LINES: "20" })?.pageSize).toBe("Letter");
  });

  it("is undefined when any setting is missing, so tailoring skips the fit instead of guessing", () => {
    expect(cvPageSettingsFromEnv({})).toBeUndefined();
    expect(cvPageSettingsFromEnv({ CV_PAGE_SIZE: "A4", CV_SCALE: "1" })).toBeUndefined();
  });

  it("rejects values it cannot use rather than fitting to a wrong page", () => {
    expect(() => cvPageSettingsFromEnv({ CV_PAGE_SIZE: "A5", CV_SCALE: "1", CV_OVERHEAD_LINES: "18" })).toThrow(/CV_PAGE_SIZE/);
    expect(() => cvPageSettingsFromEnv({ CV_PAGE_SIZE: "A4", CV_SCALE: "0", CV_OVERHEAD_LINES: "18" })).toThrow(/CV_SCALE/);
    expect(() => cvPageSettingsFromEnv({ CV_PAGE_SIZE: "A4", CV_SCALE: "1", CV_OVERHEAD_LINES: "-2" })).toThrow(/CV_OVERHEAD_LINES/);
  });
});
