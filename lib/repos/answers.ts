import { z } from "zod";
import { SCORE_DIMENSIONS, type Scores } from "../interview/score";
import { many, one, type DbClient } from "./db";
import type { InterviewAnswerRow, InterviewAttemptRow } from "./rows";

export type { InterviewAnswerRow, InterviewAttemptRow };

/**
 * Written answers and spoken practice attempts for the question bank (DESIGN.md section 3).
 *
 * One answer per (user, question), edited in place. Both drafts are kept - the free-text
 * version and the STAR version - so switching mode never discards work. Attempts are
 * append-only: the score history IS the progress, and progress is why anyone comes back.
 *
 * Audio is never stored. Only the transcript reaches the database.
 */

export const AnswerModeSchema = z.enum(["free", "star"]);
export type AnswerMode = z.infer<typeof AnswerModeSchema>;

export const AnswerSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  mode: AnswerModeSchema,
  body: z.string(),
  situation: z.string(),
  task: z.string(),
  action: z.string(),
  result: z.string(),
  updatedAt: z.string(),
});
export type Answer = z.infer<typeof AnswerSchema>;
export type NewAnswer = Omit<Answer, "id" | "updatedAt">;

const scoresSchema = z.object(
  Object.fromEntries(SCORE_DIMENSIONS.map((d) => [d, z.number()])) as Record<(typeof SCORE_DIMENSIONS)[number], z.ZodNumber>,
);

export const AttemptSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  transcript: z.string(),
  durationSeconds: z.number().nullable(),
  scores: scoresSchema,
  overall: z.number(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  model: z.string(),
  createdAt: z.string(),
});
export type Attempt = z.infer<typeof AttemptSchema>;
export type NewAttempt = Omit<Attempt, "id" | "createdAt" | "scores"> & { scores: Scores };

// ---- mappers ------------------------------------------------------------------------------

export function toAnswer(r: InterviewAnswerRow): Answer {
  return AnswerSchema.parse({
    id: r.id,
    questionId: r.question_id,
    mode: r.mode,
    body: r.body,
    situation: r.situation,
    task: r.task,
    action: r.action,
    result: r.result,
    updatedAt: r.updated_at ?? "",
  });
}

export function toAttempt(r: InterviewAttemptRow): Attempt {
  return AttemptSchema.parse({
    id: r.id,
    questionId: r.question_id,
    transcript: r.transcript,
    durationSeconds: r.duration_seconds,
    scores: r.scores,
    overall: Number(r.overall),
    strengths: r.strengths,
    improvements: r.improvements,
    model: r.model,
    createdAt: r.created_at ?? "",
  });
}

// ---- repo ---------------------------------------------------------------------------------

/** Upsert on (user, question): editing an answer updates it, never adds a second. */
export async function upsertAnswer(db: DbClient, userId: string, a: NewAnswer): Promise<Answer> {
  const row = await one(
    db
      .from("interview_answers")
      .upsert(
        {
          user_id: userId,
          question_id: a.questionId,
          mode: a.mode,
          body: a.body,
          situation: a.situation,
          task: a.task,
          action: a.action,
          result: a.result,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,question_id" },
      )
      .select()
      .single(),
    "interview_answers",
    "upsert",
  );
  return toAnswer(row);
}

export async function listAnswers(db: DbClient, userId: string): Promise<Answer[]> {
  const rows = await many(db.from("interview_answers").select().eq("user_id", userId), "interview_answers", "list");
  return rows.map(toAnswer);
}

export async function saveAttempt(db: DbClient, userId: string, a: NewAttempt): Promise<Attempt> {
  const row = await one(
    db
      .from("interview_attempts")
      .insert({
        user_id: userId,
        question_id: a.questionId,
        transcript: a.transcript,
        duration_seconds: a.durationSeconds,
        scores: a.scores,
        overall: a.overall,
        strengths: a.strengths,
        improvements: a.improvements,
        model: a.model,
      })
      .select()
      .single(),
    "interview_attempts",
    "save",
  );
  return toAttempt(row);
}

/** Newest first. Pass a question id to see one question's history. */
export async function listAttempts(db: DbClient, userId: string, questionId?: string): Promise<Attempt[]> {
  let q = db.from("interview_attempts").select().eq("user_id", userId);
  if (questionId) q = q.eq("question_id", questionId);
  const rows = await many(q.order("created_at", { ascending: false }), "interview_attempts", "list");
  return rows.map(toAttempt);
}
