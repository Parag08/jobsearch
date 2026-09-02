import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { getProfile, saveProfile } from "./profiles";

describe("profiles repo", () => {
  it("getProfile returns null before a profile exists", async () => {
    const db = new FakeDb();
    expect(await getProfile(db, "u1")).toBeNull();
  });

  it("saveProfile upserts on user_id and round-trips", async () => {
    const db = new FakeDb();
    const profile = {
      userId: "u1",
      displayName: "Parag",
      targetGeos: ["Singapore"],
      roleFamilies: ["product-management"],
      networks: [{ name: "INSEAD" }],
      visaContext: "EP sponsorship needed",
      premiumLlmBudgetUsdMonth: 5,
      contactLines: ["parag@example.com"],
      cvExtras: [{ id: "add-lang", label: "Languages", text: "English" }],
    };
    await saveProfile(db, profile);
    await saveProfile(db, { ...profile, displayName: "Parag S." });
    const reread = await getProfile(db, "u1");
    expect(reread?.displayName).toBe("Parag S.");
    expect(db.rows("profiles")).toHaveLength(1);
  });
});
