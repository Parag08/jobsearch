import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { createFullSession, saveFullSession } from "../repos/full-sessions";
import { rateInterviewerLine } from "../repos/interviewer-ratings";
import { startFull, type FullSession } from "../interview/full-session";
import type { FullPlan } from "../interview/full-plan";
import { exportEvalSet, rateLine } from "./interviewer-eval";

const AT = "2026-11-21T10:00:00Z";
const plan: FullPlan = {
  applicationId: null,
  company: "",
  role: "",
  source: "general",
  round: null,
  interviewer: null,
  contextLabel: "Context",
  topics: [{ id: "t1", kind: "topic", competency: "Impact", text: "Tell me about a launch.", short: "Launch", lookFor: "depth", context: null }],
};
const finished = (): FullSession => {
  const s = startFull(plan, { maxTopics: 2, topicFollowUps: 2, totalFollowUps: 3 }, "neutral", AT);
  return {
    ...s,
    status: "done",
    turns: [
      ...s.turns,
      { role: "candidate", text: "We cut churn by 10%.", topicId: "t1", at: AT },
      { role: "interviewer", text: "Why 10%?", topicId: "t1", move: "deepen", at: AT },
      { role: "candidate", text: "The pilot.", topicId: "t1", at: AT },
      { role: "interviewer", text: "Thanks, that's all.", topicId: "t1", move: "close", at: AT },
    ],
  };
};

describe("interviewer eval service", () => {
  it("exports your finished interviews with your ratings, and nobody else's", async () => {
    const db = new FakeDb();
    const mine = await createFullSession(db, "u1", finished());
    await createFullSession(db, "u2", finished());
    await rateInterviewerLine(db, "u1", { sessionId: mine.id, turnIndex: 2, rating: "bad", better: "What did the pilot measure?" });
    const set = await exportEvalSet(db, "u1", AT);
    expect(set.cases).toEqual([expect.objectContaining({ id: `${mine.id}:2`, sessionId: mine.id, rating: "bad", better: "What did the pilot measure?" })]);
  });

  it("rates only an interviewer line of your own interview", async () => {
    const db = new FakeDb();
    const mine = await createFullSession(db, "u1", finished());
    await saveFullSession(db, "u1", mine.id, finished());
    expect(await rateLine(db, "u1", { sessionId: mine.id, turnIndex: 2, rating: "good" })).toEqual({ ok: true });
    expect((await rateLine(db, "u1", { sessionId: mine.id, turnIndex: 1, rating: "good" })).ok).toBe(false);
    expect((await rateLine(db, "u1", { sessionId: mine.id, turnIndex: 0, rating: "good" })).ok).toBe(false);
    expect((await rateLine(db, "u2", { sessionId: mine.id, turnIndex: 2, rating: "good" })).ok).toBe(false);
    expect(db.rows("interviewer_ratings")).toHaveLength(1);
  });
});
