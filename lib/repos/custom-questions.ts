import type { StoredCustomQuestion } from "../interview/custom-questions";
import { manyByPage, one, oneOrNull, RepoError, type DbClient } from "./db";
import type { InterviewCustomQuestionRow } from "./rows";

/**
 * Questions a user typed for themselves (interview_custom_questions, migration 0011).
 * Removing one removes only the question: its written answer and attempts are hand-made
 * and stay in the database, out of sight.
 */
const toStored = (r: InterviewCustomQuestionRow): StoredCustomQuestion => ({
  id: r.id,
  text: r.text,
  createdAt: r.created_at ?? "",
  externalRef: r.external_ref ?? null,
  competency: r.competency ?? null,
  tag: r.tag ?? null,
});

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
  const rows = await manyByPage(db.from("interview_custom_questions").select("id,text,created_at,external_ref,competency,tag")
    .eq("user_id", userId).order("created_at", { ascending: false }).order("id"), "interview_custom_questions", "list");
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

export interface CustomQuestionInput {
  externalRef: string;
  text: string;
  competency?: string | null;
  tag?: string | null;
}

/**
 * Add or update a question an agent sent, keyed on its externalRef (migration 0016). An
 * update keeps the row id, so the question id `custom:<id>` - and the answers and attempts
 * keyed on it - stay with it.
 */
export async function upsertCustomQuestion(
  db: DbClient,
  userId: string,
  q: CustomQuestionInput,
): Promise<{ question: StoredCustomQuestion; created: boolean }> {
  const existing = await findCustomQuestionByExternalRef(db, userId, q.externalRef);
  const fields = { text: q.text, competency: q.competency ?? null, tag: q.tag ?? null };
  if (existing) {
    const row = await one(
      db.from("interview_custom_questions").update(fields).eq("user_id", userId).eq("id", existing.id).select().single(),
      "interview_custom_questions",
      "update",
    );
    return { question: toStored(row), created: false };
  }
  const row = await one(
    db
      .from("interview_custom_questions")
      .insert({ user_id: userId, external_ref: q.externalRef, created_at: new Date().toISOString(), ...fields })
      .select()
      .single(),
    "interview_custom_questions",
    "add",
  );
  return { question: toStored(row), created: true };
}

export async function findCustomQuestionByExternalRef(db: DbClient, userId: string, externalRef: string): Promise<StoredCustomQuestion | null> {
  const row = await oneOrNull(
    db.from("interview_custom_questions").select().eq("user_id", userId).eq("external_ref", externalRef).maybeSingle(),
    "interview_custom_questions",
    "findByExternalRef",
  );
  return row ? toStored(row) : null;
}
