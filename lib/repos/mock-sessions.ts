import type { MockSession } from "../interview/mock";
import { many, one, oneOrNull, RepoError, type DbClient } from "./db";

/**
 * Running quick mock interviews (migration 0025). The session is kept here, never round-tripped
 * through the browser, so a page cannot post one running session again and again; each turn
 * advances the stored copy, and scoring removes it.
 */
const TABLE = "interview_mock_sessions";

/** Abandoned interviews (closed tab, no feedback) are cleared when a newer one starts. */
const STALE_MS = 24 * 60 * 60 * 1000;

export async function createMockSession(db: DbClient, userId: string, session: MockSession, nowIso: string): Promise<string> {
  const stale = (await many(db.from(TABLE).select().eq("user_id", userId), TABLE, "list")).filter(
    (r) => Date.parse(r.updated_at ?? r.created_at ?? nowIso) < Date.parse(nowIso) - STALE_MS,
  );
  for (const r of stale) await deleteMockSession(db, userId, r.id);
  const row = await one(
    db.from(TABLE).insert({ user_id: userId, question_id: session.questionId, status: session.status, session, created_at: nowIso, updated_at: nowIso }).select().single(),
    TABLE,
    "create",
  );
  return row.id;
}

export async function getMockSession(db: DbClient, userId: string, id: string): Promise<unknown | null> {
  const row = await oneOrNull(db.from(TABLE).select().eq("user_id", userId).eq("id", id).maybeSingle(), TABLE, "get");
  return row ? row.session : null;
}

export async function saveMockSession(db: DbClient, userId: string, id: string, session: MockSession, nowIso: string): Promise<void> {
  await one(
    db.from(TABLE).update({ session, status: session.status, updated_at: nowIso }).eq("user_id", userId).eq("id", id).select().single(),
    TABLE,
    "save",
  );
}

export async function deleteMockSession(db: DbClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from(TABLE).delete().eq("user_id", userId).eq("id", id);
  if (error) throw new RepoError(TABLE, "delete", error.message);
}
