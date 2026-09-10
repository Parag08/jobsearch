import { describe, it, expect } from "vitest";
import * as onboarding from "./index";

describe("lib/onboarding public API", () => {
  it("exports the skeleton schema, the merge, the three guards, readiness and nudges", () => {
    expect(onboarding.SkeletonSchema).toBeDefined();
    expect(typeof onboarding.mergeSkeletons).toBe("function");
    expect(typeof onboarding.provenanceCheck).toBe("function");
    expect(typeof onboarding.needsMetric).toBe("function");
    expect(typeof onboarding.capStrength).toBe("function");
    expect(typeof onboarding.readiness).toBe("function");
    expect(typeof onboarding.proudestThree).toBe("function");
    expect(typeof onboarding.nudgeQueue).toBe("function");
  });
});
