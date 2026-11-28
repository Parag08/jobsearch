import type { StoredRoleQuestion } from "../interview/role-questions";
import { manyByPage, many, oneOrNull, RepoError, type DbClient } from "./db";
import type { InterviewRoleQuestionRow } from "./rows";

/**
 * Questions prepared for one application's interview (interview_role_questions, migration
 * 0012). Written only through the agent service (lib/services/role-interview.ts), keyed on
 * (user_id, external_ref): pushing the same ref again updates the row in place, so its
 * question id - and the answers and attempts filed under it - never change.
 */

export interface RoleQuestionWrite {
  externalRef: string;
  round: string | null;
  interviewer: string | null;
  position: number;
  competency: string;
  text: string;
  short: string | null;
  lookFor: string;
  context: string | null;
  source: string | null;
}

const toStored = (r: InterviewRoleQuestionRow): StoredRoleQuestion => ({
  id: r.id,
  applicationId: r.application_id,
  externalRef: r.external_ref,
  round: r.round,
  interviewer: r.interviewer,
  position: r.position,
  competency: r.competency,
  text: r.text,
  short: r.short,
  lookFor: r.look_for,
  context: r.context,
  source: r.source,
  updatedAt: r.updated_at ?? "",
});

const TABLE = "interview_role_questions";

/** All of one user's role questions, every application, application then position order. */
export async function listRoleQuestions(db: DbClient, userId: string): Promise<StoredRoleQuestion[]> {
  const rows = await manyByPage(db.from(TABLE).select("id,application_id,external_ref,round,interviewer,position,competency,text,short,look_for,context,source,updated_at")
    .eq("user_id", userId).order("id"), TABLE, "list");
  return rows
    .map(toStored)
    .sort((a, b) => (a.applicationId === b.applicationId ? a.position - b.position : a.applicationId < b.applicationId ? -1 : 1));
}

export async function getRoleQuestion(db: DbClient, userId: string, id: string): Promise<StoredRoleQuestion | null> {
  const row = await oneOrNull(db.from(TABLE).select().eq("user_id", userId).eq("id", id).maybeSingle(), TABLE, "get");
  return row ? toStored(row) : null;
}

/** Insert or update each question on its ref. Returns how many were new and how many changed. */
export async function upsertRoleQuestions(
  db: DbClient,
  userId: string,
  applicationId: string,
  questions: RoleQuestionWrite[],
  nowIso: string,
): Promise<{ created: number; updated: number }> {
  const existing = new Set((await listRoleQuestions(db, userId)).map((q) => q.externalRef));
  const rows = questions.map((q) => ({
    user_id: userId,
    application_id: applicationId,
    external_ref: q.externalRef,
    round: q.round,
    interviewer: q.interviewer,
    position: q.position,
    competency: q.competency,
    text: q.text,
    short: q.short,
    look_for: q.lookFor,
    context: q.context,
    source: q.source,
    updated_at: nowIso,
  }));
  const { error } = await db.from(TABLE).upsert(rows, { onConflict: "user_id,external_ref" });
  if (error) throw new RepoError(TABLE, "upsert", error.message);
  const created = questions.filter((q) => !existing.has(q.externalRef)).length;
  return { created, updated: questions.length - created };
}

/** Remove questions by ref. Their answers and attempts stay in the database, unseen. */
export async function removeRoleQuestions(db: DbClient, userId: string, externalRefs: string[]): Promise<number> {
  const mine = (await listRoleQuestions(db, userId)).filter((q) => externalRefs.includes(q.externalRef));
  if (!mine.length) return 0;
  const { error } = await db.from(TABLE).delete().eq("user_id", userId).in("id", mine.map((q) => q.id));
  if (error) throw new RepoError(TABLE, "remove", error.message);
  return mine.length;
}
