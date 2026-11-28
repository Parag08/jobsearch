import type { RolePlay, RolePlayLine, RolePlaySource } from "../interview/role-play";
import { manyByPage, oneOrNull, RepoError, type DbClient } from "./db";
import type { InterviewRolePlayRow } from "./rows";

/** Role-plays (interview_role_plays, migration 0017): one per user and question id. */
const TABLE = "interview_role_plays";

const toRolePlay = (r: InterviewRolePlayRow): RolePlay => ({
  questionId: r.question_id,
  lines: (r.lines as RolePlayLine[]) ?? [],
  source: r.source,
  basedOn: r.based_on,
  model: r.model ?? null,
  updatedAt: r.updated_at ?? "",
});

export async function getRolePlay(db: DbClient, userId: string, questionId: string): Promise<RolePlay | null> {
  const row = await oneOrNull(db.from(TABLE).select().eq("user_id", userId).eq("question_id", questionId).maybeSingle(), TABLE, "get");
  return row ? toRolePlay(row) : null;
}

export async function listRolePlays(db: DbClient, userId: string): Promise<RolePlay[]> {
  return (await manyByPage(db.from(TABLE).select("question_id,lines,source,based_on,model,updated_at")
    .eq("user_id", userId).order("updated_at", { ascending: false }).order("question_id"), TABLE, "list")).map(toRolePlay);
}

/** Insert or replace. Callers decide whether they may (an agent never replaces an app-built play unless forced). */
export async function putRolePlay(
  db: DbClient,
  userId: string,
  p: { questionId: string; lines: RolePlayLine[]; source: RolePlaySource; basedOn: string; model: string | null },
  nowIso: string,
): Promise<RolePlay> {
  const { error } = await db.from(TABLE).upsert(
    { user_id: userId, question_id: p.questionId, lines: p.lines, source: p.source, based_on: p.basedOn, model: p.model, updated_at: nowIso },
    { onConflict: "user_id,question_id" },
  );
  if (error) throw new RepoError(TABLE, "put", error.message);
  return { ...p, updatedAt: nowIso };
}
