import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { getUserSettings, putUserSettings } from "./user-settings";

describe("user settings repo", () => {
  it("is empty until saved, then replaces the whole set, per user", async () => {
    const db = new FakeDb();
    expect(await getUserSettings(db, "u1")).toEqual({});
    await putUserSettings(db, "u1", { INTERVIEW_TURN_SILENCE_MS: "3000", HOME_GOAL_APPLY: "5" });
    await putUserSettings(db, "u1", { INTERVIEW_TURN_SILENCE_MS: "2500" });
    expect(await getUserSettings(db, "u1")).toEqual({ INTERVIEW_TURN_SILENCE_MS: "2500" });
    expect(await getUserSettings(db, "u2")).toEqual({});
    expect(db.rows("user_settings")).toHaveLength(1);
  });
});
