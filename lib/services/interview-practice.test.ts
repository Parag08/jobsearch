import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { upsertAnswer } from "../repos/answers";
import { upsertApplication } from "./agent-sync";
import { saveRoleInterview } from "./role-interview";
import { listInterviewPractice } from "./interview-practice";
import { RoleInterviewInputSchema } from "../interview/role-questions";

const scores = { structure: 4, ownership: 3, specificity: 4, impact: 4, reflection: 3, relevance: 5 };
const attempt = (userId: string, questionId: string, created_at: string, transcript: string) => ({
  user_id: userId, question_id: questionId, transcript, duration_seconds: 90, scores, overall: 3.8,
  strengths: ["clear"], improvements: ["say I"], model: "m", created_at,
});

async function setup() {
  const db = new FakeDb();
  await upsertApplication({ db }, "u1", { externalRef: "cog", company: "Cognition", role: "DE" }, "2026-11-18");
  await saveRoleInterview({ db }, "u1", RoleInterviewInputSchema.parse({
    externalRef: "cog",
    questions: [
      { externalRef: "cog:bg", competency: "Fit", text: "Background?", lookFor: "x" },
      { externalRef: "cog:deep", competency: "Depth", text: "Deep dive?", lookFor: "y" },
    ],
  }), "2026-11-18T00:00:00Z");
  const ids = db.rows("interview_role_questions").map((r) => `role:${r.id}`);
  return { db, ids };
}

describe("listInterviewPractice", () => {
  it("returns one application's questions with written answer and newest attempts", async () => {
    const { db, ids } = await setup();
    await upsertAnswer(db, "u1", { questionId: ids[0], mode: "free", body: "My notes", situation: "", task: "", action: "", result: "" });
    db.seed("interview_attempts", [
      attempt("u1", ids[0], "2026-11-18T10:00:00Z", "first"),
      attempt("u1", ids[0], "2026-11-19T10:00:00Z", "second"),
      attempt("u1", "fit-about-yourself", "2026-11-19T10:00:00Z", "generic"),
      attempt("u2", ids[0], "2026-11-19T11:00:00Z", "someone else"),
    ]);
    const r = await listInterviewPractice({ db }, "u1", { externalRef: "cog", attemptsPerQuestion: 1 });
    expect(r.questions.map((q) => q.text)).toEqual(["Background?", "Deep dive?"]);
    expect(r.questions[0].writtenAnswer?.body).toBe("My notes");
    expect(r.questions[0].attemptCount).toBe(2);
    expect(r.questions[0].attempts.map((a) => a.transcript)).toEqual(["second"]);
    expect(r.questions[1]).toMatchObject({ attemptCount: 0, writtenAnswer: null, attempts: [] });
  });

  it("with no scope, lists every question practised since a date", async () => {
    const { db, ids } = await setup();
    db.seed("interview_attempts", [
      attempt("u1", ids[1], "2026-11-17T10:00:00Z", "old"),
      attempt("u1", "fit-about-yourself", "2026-11-19T10:00:00Z", "generic"),
    ]);
    const r = await listInterviewPractice({ db }, "u1", { since: "2026-11-18", attemptsPerQuestion: 3 });
    expect(r.questions.map((q) => q.questionId)).toEqual(["fit-about-yourself"]);
    expect(r.questions[0].text).toBeNull();
  });
});
