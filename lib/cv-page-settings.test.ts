import { describe, it, expect } from "vitest";
import { cvPageSettingsFromEnv, cvSelectionSettingsFromEnv } from "./cv-page-settings";

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

describe("cvSelectionSettingsFromEnv", () => {
  const env = { CV_MAX_BULLETS: "16", CV_MAX_PER_ROLE: "3", CV_MIN_PER_ROLE: "1", CV_MAX_ORG_SHARE: "0.34", CV_COLLISION_OVERLAP: "0.35" };

  it("reads every whole-pool selection limit", () => {
    expect(cvSelectionSettingsFromEnv(env)).toEqual({ maxBullets: 16, maxPerRole: 3, minPerRole: 1, maxOrgShare: 0.34, collisionOverlap: 0.35 });
  });

  it("is undefined when any is missing, so tailoring keeps the master-based selection", () => {
    expect(cvSelectionSettingsFromEnv({ ...env, CV_MAX_ORG_SHARE: undefined })).toBeUndefined();
  });

  it("rejects values it cannot use", () => {
    expect(() => cvSelectionSettingsFromEnv({ ...env, CV_MAX_BULLETS: "0" })).toThrow(/CV_MAX_BULLETS/);
    expect(() => cvSelectionSettingsFromEnv({ ...env, CV_MAX_ORG_SHARE: "1.5" })).toThrow(/CV_MAX_ORG_SHARE/);
    expect(() => cvSelectionSettingsFromEnv({ ...env, CV_MIN_PER_ROLE: "4" })).toThrow(/CV_MIN_PER_ROLE/);
  });
});
