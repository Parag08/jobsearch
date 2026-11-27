import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { listInterviewerRatings, rateInterviewerLine } from "./interviewer-ratings";

describe("interviewer ratings repo", () => {
  it("keeps one verdict per line, replaces it on a second rating, and clears it", async () => {
    const db = new FakeDb();
    await rateInterviewerLine(db, "u1", { sessionId: "s1", turnIndex: 2, rating: "bad", better: "  What did you personally build? " });
    await rateInterviewerLine(db, "u1", { sessionId: "s1", turnIndex: 4, rating: "good" });
    await rateInterviewerLine(db, "u1", { sessionId: "s1", turnIndex: 4, rating: "bad" });
    let got = await listInterviewerRatings(db, "u1");
    expect(got.map((r) => [r.turnIndex, r.rating, r.better])).toEqual([
      [2, "bad", "What did you personally build?"],
      [4, "bad", null],
    ]);
    await rateInterviewerLine(db, "u1", { sessionId: "s1", turnIndex: 2, rating: null });
    got = await listInterviewerRatings(db, "u1", "s1");
    expect(got.map((r) => r.turnIndex)).toEqual([4]);
  });

  it("drops the better line on a good rating, and never shows another user's ratings", async () => {
    const db = new FakeDb();
    await rateInterviewerLine(db, "u1", { sessionId: "s1", turnIndex: 2, rating: "good", better: "ignored" });
    await rateInterviewerLine(db, "u2", { sessionId: "s9", turnIndex: 2, rating: "bad" });
    expect(await listInterviewerRatings(db, "u1")).toEqual([expect.objectContaining({ sessionId: "s1", rating: "good", better: null })]);
    expect(await listInterviewerRatings(db, "u1", "s9")).toEqual([]);
  });

  it("keys a verdict on the user too, so another user's row on the same line never replaces or blocks yours", async () => {
    const db = new FakeDb();
    await rateInterviewerLine(db, "u2", { sessionId: "s1", turnIndex: 2, rating: "good" });
    await rateInterviewerLine(db, "u1", { sessionId: "s1", turnIndex: 2, rating: "bad", better: "Ask about the trade-off." });
    expect(await listInterviewerRatings(db, "u1", "s1")).toEqual([
      { sessionId: "s1", turnIndex: 2, rating: "bad", better: "Ask about the trade-off." },
    ]);
    expect(await listInterviewerRatings(db, "u2", "s1")).toEqual([expect.objectContaining({ rating: "good" })]);
  });
});
