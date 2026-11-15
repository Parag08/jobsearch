import { describe, it, expect } from "vitest";
import { pipelineColumnMaxFromEnv, pipelineRecentDaysFromEnv } from "./pipeline-settings";

describe("pipelineRecentDaysFromEnv", () => {
  it("reads the window from PIPELINE_RECENT_DAYS", () => {
    expect(pipelineRecentDaysFromEnv({ PIPELINE_RECENT_DAYS: "7" })).toBe(7);
  });

  it("is undefined when unset, so the board shows everything rather than guessing a window", () => {
    expect(pipelineRecentDaysFromEnv({})).toBeUndefined();
  });

  it("rejects a value that is present but unusable", () => {
    for (const bad of ["0", "-3", "1.5", "week"]) {
      expect(() => pipelineRecentDaysFromEnv({ PIPELINE_RECENT_DAYS: bad })).toThrow(/PIPELINE_RECENT_DAYS/);
    }
  });
});

describe("pipelineColumnMaxFromEnv", () => {
  it("reads how many cards a column shows before 'show more'", () => {
    expect(pipelineColumnMaxFromEnv({ PIPELINE_COLUMN_MAX: "6" })).toBe(6);
  });
  it("is undefined when unset (columns show everything), and rejects an unusable value", () => {
    expect(pipelineColumnMaxFromEnv({})).toBeUndefined();
    expect(() => pipelineColumnMaxFromEnv({ PIPELINE_COLUMN_MAX: "none" })).toThrow(/PIPELINE_COLUMN_MAX/);
  });
});
