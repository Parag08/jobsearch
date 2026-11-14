import { describe, it, expect } from "vitest";
import { rolePlanMaxGapsFromEnv, roleReadBatchFromEnv } from "./settings";

describe("role insights settings", () => {
  it("reads each value from its own key", () => {
    expect(rolePlanMaxGapsFromEnv({ ROLE_PLAN_MAX_GAPS: "8" })).toBe(8);
    expect(roleReadBatchFromEnv({ ROLE_READ_BATCH: "5" })).toBe(5);
  });
  it("is undefined when unset, and rejects an unusable value", () => {
    expect(rolePlanMaxGapsFromEnv({})).toBeUndefined();
    expect(() => roleReadBatchFromEnv({ ROLE_READ_BATCH: "0" })).toThrow(/ROLE_READ_BATCH/);
  });
});
