import { describe, it, expect } from "vitest";
import { DEMO_USER_ID, getDemoDb } from "./demo";
import { getProfile } from "../repos/profiles";

describe("getDemoDb", () => {
  it("loads the repo-owned per-org caps and the taxonomy along with the corpus", async () => {
    const profile = await getProfile(getDemoDb(), DEMO_USER_ID);
    expect(profile?.orgCaps).toEqual({ "Valeo Health": 2, "EverHaus Group": 2 });
    expect(Object.keys(profile?.taxonomy?.tags ?? {}).length).toBeGreaterThan(0);
  });
});
