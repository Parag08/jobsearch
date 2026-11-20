import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { createFullSession, finishFullSession, getFullSession, listFullSessions, saveFullSession } from "./full-sessions";
import { startFull } from "../interview/full-session";
import type { FullPlan } from "../interview/full-plan";

const plan: FullPlan = {
  applicationId: "app1",
  company: "C",
  role: "R",
  source: "job",
  round: null,
  interviewer: null,
  contextLabel: "x",
  topics: [{ id: "t1", kind: "opener", competency: "c", text: "Q1?", short: "Q1", lookFor: "l", context: null }],
};
const session = startFull(plan, { maxTopics: 2, topicFollowUps: 1, totalFollowUps: 1 }, "neutral", "2026-11-20T10:00:00.000Z");
const scores = { structure: 4, ownership: 3, specificity: 3, impact: 4, reflection: 2, relevance: 4 };

describe("full sessions repo", () => {
  it("creates, saves in place, finishes and lists newest first per user", async () => {
    const db = new FakeDb();
    const s = await createFullSession(db, "u1", session);
    expect(s).toMatchObject({ applicationId: "app1", status: "running", overall: null, moments: [], perTopic: [] });
    expect(db.rows("interview_full_sessions")[0]).toMatchObject({ user_id: "u1", application_id: "app1" });

    await saveFullSession(db, "u1", s.id, { ...session, turns: [...session.turns, { role: "candidate", text: "a", topicId: "t1", at: "x" }] });
    expect((await getFullSession(db, "u1", s.id))?.session.turns).toHaveLength(2);

    await finishFullSession(db, "u1", s.id, {
      session: { ...session, status: "done" },
      scores,
      overall: 3.3,
      strengths: ["s"],
      improvements: ["i"],
      perTopic: [{ topicId: "t1", verdict: "held", note: "n" }],
      moments: [{ topicId: "t1", quote: "q", better: "b" }],
      model: "m",
    });
    const done = await getFullSession(db, "u1", s.id);
    expect(done).toMatchObject({ status: "done", overall: 3.3, perTopic: [{ topicId: "t1" }], moments: [{ quote: "q" }], model: "m" });

    expect(await getFullSession(db, "u2", s.id)).toBeNull();
    expect(await listFullSessions(db, "u1", "app1")).toHaveLength(1);
    expect(await listFullSessions(db, "u2")).toHaveLength(0);
  });
});
