import { topicsAsked, type FullSession, type Moment, type TopicVerdict } from "../interview/full-session";
import type { Scores } from "../interview/score";
import { HISTORY_LIMIT, many, manyByPage, one, oneOrNull, RepoError, type DbClient } from "./db";
import type { InterviewFullSessionRow } from "./rows";

/**
 * Full mock interviews (migration 0017, docs/FULL-INTERVIEW.md). One row per interview: the
 * whole session is saved after every turn, so a refresh resumes it; finishing adds the debrief.
 */
const TABLE = "interview_full_sessions";

export interface StoredFullSession {
  id: string;
  /** Null for a general practice interview. */
  applicationId: string | null;
  status: "running" | "done";
  session: FullSession;
  scores: Scores | null;
  overall: number | null;
  strengths: string[];
  improvements: string[];
  perTopic: TopicVerdict[];
  moments: Moment[];
  model: string;
  createdAt: string;
  updatedAt: string;
}

const toStored = (r: InterviewFullSessionRow): StoredFullSession => ({
  id: r.id,
  applicationId: r.application_id,
  status: r.status,
  session: r.session as FullSession,
  scores: (r.scores as Scores | null) ?? null,
  overall: r.overall === null || r.overall === undefined ? null : Number(r.overall),
  strengths: r.strengths ?? [],
  improvements: r.improvements ?? [],
  perTopic: (r.per_topic as TopicVerdict[] | null) ?? [],
  moments: (r.moments as Moment[] | null) ?? [],
  model: r.model ?? "",
  createdAt: r.created_at ?? "",
  updatedAt: r.updated_at ?? "",
});

export async function createFullSession(db: DbClient, userId: string, session: FullSession): Promise<StoredFullSession> {
  const row = await one(
    db
      .from(TABLE)
      .insert({ user_id: userId, application_id: session.plan.applicationId, status: session.status, session, strengths: [], improvements: [] })
      .select()
      .single(),
    TABLE,
    "create",
  );
  return toStored(row);
}

export async function getFullSession(db: DbClient, userId: string, id: string): Promise<StoredFullSession | null> {
  const row = await oneOrNull(db.from(TABLE).select().eq("user_id", userId).eq("id", id).maybeSingle(), TABLE, "get");
  return row ? toStored(row) : null;
}

export async function saveFullSession(db: DbClient, userId: string, id: string, session: FullSession): Promise<void> {
  await one(
    db.from(TABLE).update({ session, status: session.status, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("id", id).select().single(),
    TABLE,
    "save",
  );
}

export interface FullResult {
  session: FullSession;
  scores: Scores;
  overall: number;
  strengths: string[];
  improvements: string[];
  perTopic: TopicVerdict[];
  moments: Moment[];
  model: string;
}

export async function finishFullSession(db: DbClient, userId: string, id: string, r: FullResult): Promise<void> {
  await one(
    db
      .from(TABLE)
      .update({
        session: r.session,
        status: "done",
        scores: r.scores,
        overall: r.overall,
        strengths: r.strengths,
        improvements: r.improvements,
        per_topic: r.perTopic,
        moments: r.moments,
        model: r.model,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .single(),
    TABLE,
    "finish",
  );
}

/** Newest first; pass an application id for one application's interviews, or null for general practice ones. */
export async function listFullSessions(db: DbClient, userId: string, applicationId?: string | null): Promise<StoredFullSession[]> {
  const columns = "id,application_id,status,session,scores,overall,strengths,improvements,per_topic,moments,model,created_at,updated_at";
  return (await many(fullSessionList(db, userId, applicationId, columns).limit(HISTORY_LIMIT), TABLE, "list")).map(toStored);
}

export async function listFullSessionsForEval(db: DbClient, userId: string): Promise<Pick<StoredFullSession, "id" | "session">[]> {
  const rows = await manyByPage(fullSessionList(db, userId, undefined, "id,session"), TABLE, "list for eval");
  return rows.map((r) => ({ id: r.id, session: r.session as FullSession }));
}

export type FullSessionSummary = Pick<StoredFullSession, "id" | "applicationId" | "status" | "overall" | "createdAt" | "updatedAt"> & { topics: number };

export async function listFullSessionSummaries(db: DbClient, userId: string, applicationId?: string | null): Promise<FullSessionSummary[]> {
  const columns = "id,application_id,status,overall,created_at,updated_at,session:session->turns";
  const rows = await manyByPage(fullSessionList(db, userId, applicationId, columns), TABLE, "list summaries");
  return rows.map((r) => ({
    id: r.id,
    applicationId: r.application_id,
    status: r.status,
    overall: r.overall == null ? null : Number(r.overall),
    createdAt: r.created_at ?? "",
    updatedAt: r.updated_at ?? "",
    topics: topicsAsked({ turns: (r.session as FullSession["turns"] | null) ?? [] }).length,
  }));
}

function fullSessionList(db: DbClient, userId: string, applicationId: string | null | undefined, columns: string) {
  let q = db.from(TABLE).select(columns).eq("user_id", userId);
  if (applicationId === null) q = q.is("application_id", null);
  else if (applicationId !== undefined) q = q.eq("application_id", applicationId);
  return q.order("created_at", { ascending: false }).order("id");
}

/**
 * Throw away an interview that is still running ("Discard"): no debrief, nothing kept. A
 * finished interview is a report and is never removed this way. True when a row was removed.
 */
export async function discardFullSession(db: DbClient, userId: string, id: string): Promise<boolean> {
  const found = await getFullSession(db, userId, id);
  if (!found || found.status !== "running") return false;
  const { error } = await db.from(TABLE).delete().eq("user_id", userId).eq("id", id).eq("status", "running");
  if (error) throw new RepoError(TABLE, "discard", error.message);
  return true;
}
