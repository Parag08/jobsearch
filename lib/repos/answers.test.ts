import { describe, it, expect } from "vitest";
import { FakeDb } from "./fake-db";
import { listAnswers, listAttempts, saveAttempt, upsertAnswer } from "./answers";

const answer = {
  questionId: "resilience-failure",
  mode: "star" as const,
  body: "",
  situation: "A launch slipped.",
  task: "I owned the date.",
  action: "I told the VP early.",
  result: "We shipped two weeks late but kept the customer.",
};

const scores = { structure: 4, ownership: 3, specificity: 4, impact: 4, reflection: 3, relevance: 5 };

describe("answers repo", () => {
  it("saves one answer per question per user", async () => {
    const db = new FakeDb();
    const saved = await upsertAnswer(db, "u1", answer);
    expect(saved).toMatchObject({ questionId: "resilience-failure", mode: "star", result: answer.result });
    expect(db.rows("interview_answers")[0]).toMatchObject({ user_id: "u1", question_id: "resilience-failure" });
  });

  it("editing an answer updates it rather than adding a second one", async () => {
    const db = new FakeDb();
    await upsertAnswer(db, "u1", answer);
    await upsertAnswer(db, "u1", { ...answer, result: "Rewritten result." });
    const all = await listAnswers(db, "u1");
    expect(all).toHaveLength(1);
    expect(all[0].result).toBe("Rewritten result.");
  });

  it("keeps a free-text draft and a STAR draft side by side, so switching mode loses nothing", async () => {
    const db = new FakeDb();
    await upsertAnswer(db, "u1", { ...answer, mode: "free", body: "Messy version." });
    const [a] = await listAnswers(db, "u1");
    expect(a.mode).toBe("free");
    expect(a.body).toBe("Messy version.");
    expect(a.situation).toBe(answer.situation);
  });

  it("keeps each user's answers private to them", async () => {
    const db = new FakeDb();
    await upsertAnswer(db, "u1", answer);
    await upsertAnswer(db, "u2", { ...answer, result: "theirs" });
    expect(await listAnswers(db, "u1")).toHaveLength(1);
  });

  it("records every practice attempt, so progress over time is visible", async () => {
    const db = new FakeDb();
    await saveAttempt(db, "u1", {
      questionId: "resilience-failure",
      transcript: "I missed a deadline.",
      durationSeconds: 95,
      scores,
      overall: 3.8,
      strengths: ["Owned it"],
      improvements: ["Say the number"],
      model: "google/gemini-2.5-flash-lite",
    });
    await saveAttempt(db, "u1", {
      questionId: "resilience-failure",
      transcript: "Second go.",
      durationSeconds: 110,
      scores,
      overall: 4.2,
      strengths: [],
      improvements: [],
      model: "google/gemini-2.5-flash-lite",
    });
    const attempts = await listAttempts(db, "u1", "resilience-failure");
    expect(attempts).toHaveLength(2);
    expect(attempts.map((a) => a.overall).sort()).toEqual([3.8, 4.2]);
  });

  it("lists attempts across all questions when none is given", async () => {
    const db = new FakeDb();
    await saveAttempt(db, "u1", {
      questionId: "a", transcript: "x", durationSeconds: null, scores, overall: 3, strengths: [], improvements: [], model: "m",
    });
    await saveAttempt(db, "u1", {
      questionId: "b", transcript: "y", durationSeconds: null, scores, overall: 4, strengths: [], improvements: [], model: "m",
    });
    expect(await listAttempts(db, "u1")).toHaveLength(2);
  });
});
