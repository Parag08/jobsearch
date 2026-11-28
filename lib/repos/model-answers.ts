import type { ModelAnswer, ModelAnswerSource } from "../interview/model-answer";
import { manyByPage, oneOrNull, RepoError, type DbClient } from "./db";
import type { InterviewModelAnswerRow } from "./rows";

/** Model answers (interview_model_answers, migration 0013): one per user and question id. */
const TABLE = "interview_model_answers";

const toModelAnswer = (r: InterviewModelAnswerRow): ModelAnswer => ({
  questionId: r.question_id,
  text: r.text,
  source: r.source,
  updatedAt: r.updated_at ?? "",
});

export async function getModelAnswer(db: DbClient, userId: string, questionId: string): Promise<ModelAnswer | null> {
  const row = await oneOrNull(db.from(TABLE).select().eq("user_id", userId).eq("question_id", questionId).maybeSingle(), TABLE, "get");
  return row ? toModelAnswer(row) : null;
}

export async function listModelAnswers(db: DbClient, userId: string): Promise<ModelAnswer[]> {
  return (await manyByPage(db.from(TABLE).select("question_id,text,source,updated_at")
    .eq("user_id", userId).order("updated_at", { ascending: false }).order("question_id"), TABLE, "list")).map(toModelAnswer);
}

/** Insert or replace the model answer for one question. Callers decide whether they may (mayOverwrite). */
export async function putModelAnswer(
  db: DbClient,
  userId: string,
  a: { questionId: string; text: string; source: ModelAnswerSource },
  nowIso: string,
): Promise<ModelAnswer> {
  const { error } = await db
    .from(TABLE)
    .upsert({ user_id: userId, question_id: a.questionId, text: a.text, source: a.source, updated_at: nowIso }, { onConflict: "user_id,question_id" });
  if (error) throw new RepoError(TABLE, "put", error.message);
  return { ...a, updatedAt: nowIso };
}
