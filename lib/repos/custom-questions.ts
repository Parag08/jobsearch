import type { StoredCustomQuestion } from "../interview/custom-questions";
import { many, one, oneOrNull, RepoError, type DbClient } from "./db";
import type { InterviewCustomQuestionRow } from "./rows";

/**
 * Questions a user typed for themselves (interview_custom_questions, migration 0011).
 * Removing one removes only the question: its written answer and attempts are hand-made
 * and stay in the database, out of sight.
 */
const toStored = (r: InterviewCustomQuestionRow): StoredCustomQuestion => ({ id: r.id, text: r.text, createdAt: r.created_at ?? "" });

export async function addCustomQuestion(db: DbClient, userId: string, text: string): Promise<StoredCustomQuestion> {
  const row = await one(
    db
      .from("interview_custom_questions")
      .insert({ user_id: userId, text, created_at: new Date().toISOString() })
      .select()
      .single(),
    "interview_custom_questions",
    "add",
  );
  return toStored(row);
}

export async function listCustomQuestions(db: DbClient, userId: string): Promise<StoredCustomQuestion[]> {
  const rows = await many(db.from("interview_custom_questions").select().eq("user_id", userId), "interview_custom_questions", "list");
  return rows.map(toStored);
}

export async function getCustomQuestion(db: DbClient, userId: string, id: string): Promise<StoredCustomQuestion | null> {
  const row = await oneOrNull(
    db.from("interview_custom_questions").select().eq("user_id", userId).eq("id", id).maybeSingle(),
    "interview_custom_questions",
    "get",
  );
  return row ? toStored(row) : null;
}

export async function removeCustomQuestion(db: DbClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from("interview_custom_questions").delete().eq("user_id", userId).eq("id", id);
  if (error) throw new RepoError("interview_custom_questions", "remove", error.message);
}
