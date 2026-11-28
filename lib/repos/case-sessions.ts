import type { CaseDimension, CaseSession } from "../interview/case-session";
import { LIST_LIMIT, many, one, oneOrNull, type DbClient } from "./db";
import type { CaseSessionRow } from "./rows";

export type { CaseSessionRow };

/**
 * Case interviews (DESIGN.md section 3). One row per attempt at a case: the whole session
 * - turns, current question, math checks - is saved after every turn, so a refresh or a
 * dropped connection resumes where you were. Finishing adds the scored debrief. Rows are
 * never overwritten by a new attempt: the history is the progress.
 */

export interface StoredCaseSession {
  id: string;
  caseId: string;
  status: "running" | "done";
  session: CaseSession;
  scores: Record<CaseDimension, number> | null;
  overall: number | null;
  strengths: string[];
  improvements: string[];
  perQuestion: { questionId: string; note: string }[];
  model: string;
  createdAt: string;
  updatedAt: string;
}

export function toStoredCaseSession(r: CaseSessionRow): StoredCaseSession {
  return {
    id: r.id,
    caseId: r.case_id,
    status: r.status,
    session: r.session as CaseSession,
    scores: (r.scores as Record<CaseDimension, number> | null) ?? null,
    overall: r.overall === null || r.overall === undefined ? null : Number(r.overall),
    strengths: r.strengths ?? [],
    improvements: r.improvements ?? [],
    perQuestion: (r.per_question as { questionId: string; note: string }[] | null) ?? [],
    model: r.model ?? "",
    createdAt: r.created_at ?? "",
    updatedAt: r.updated_at ?? "",
  };
}

export async function createCaseSession(db: DbClient, userId: string, session: CaseSession): Promise<StoredCaseSession> {
  const row = await one(
    db
      .from("case_sessions")
      .insert({ user_id: userId, case_id: session.caseId, status: session.status, session, strengths: [], improvements: [] })
      .select()
      .single(),
    "case_sessions",
    "create",
  );
  return toStoredCaseSession(row);
}

export async function getCaseSession(db: DbClient, userId: string, id: string): Promise<StoredCaseSession | null> {
  const row = await oneOrNull(
    db.from("case_sessions").select().eq("user_id", userId).eq("id", id).maybeSingle(),
    "case_sessions",
    "get",
  );
  return row ? toStoredCaseSession(row) : null;
}

/** Save progress after a turn. */
export async function saveCaseSession(db: DbClient, userId: string, id: string, session: CaseSession): Promise<void> {
  await one(
    db
      .from("case_sessions")
      .update({ session, status: session.status, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .single(),
    "case_sessions",
    "save",
  );
}

export interface CaseResult {
  session: CaseSession;
  scores: Record<CaseDimension, number>;
  overall: number;
  strengths: string[];
  improvements: string[];
  perQuestion: { questionId: string; note: string }[];
  model: string;
}

export async function finishCaseSession(db: DbClient, userId: string, id: string, r: CaseResult): Promise<void> {
  await one(
    db
      .from("case_sessions")
      .update({
        session: r.session,
        status: "done",
        scores: r.scores,
        overall: r.overall,
        strengths: r.strengths,
        improvements: r.improvements,
        per_question: r.perQuestion,
        model: r.model,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .single(),
    "case_sessions",
    "finish",
  );
}

/** Newest first. Pass a case id to see one case's history. */
export async function listCaseSessions(db: DbClient, userId: string, caseId?: string): Promise<{ caseId: string; updatedAt: string; turnTimes: string[] }[]> {
  let q = db.from("case_sessions").select("case_id,session:session->turns,updated_at").eq("user_id", userId);
  if (caseId) q = q.eq("case_id", caseId);
  const rows = await many(q.order("created_at", { ascending: false }).limit(LIST_LIMIT), "case_sessions", "list");
  return rows.map((r) => ({
    caseId: r.case_id,
    updatedAt: r.updated_at ?? "",
    turnTimes: ((r.session as CaseSession["turns"] | null) ?? []).map((t) => t.at),
  }));
}

export type CaseSessionSummary = Pick<StoredCaseSession, "caseId" | "status" | "overall">;

export async function listCaseSessionSummaries(db: DbClient, userId: string): Promise<CaseSessionSummary[]> {
  const rows = await many(db.from("case_sessions").select("case_id,status,overall").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(LIST_LIMIT), "case_sessions", "list summaries");
  return rows.map((r) => ({ caseId: r.case_id, status: r.status, overall: r.overall == null ? null : Number(r.overall) }));
}

export async function getLatestCaseSession(db: DbClient, userId: string, caseId: string): Promise<StoredCaseSession | null> {
  const row = await oneOrNull(db.from("case_sessions")
    .select("id,case_id,status,session,scores,overall,strengths,improvements,per_question,model,created_at,updated_at")
    .eq("user_id", userId).eq("case_id", caseId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    "case_sessions", "get latest");
  return row ? toStoredCaseSession(row) : null;
}
