import { LIST_LIMIT, many, one, RepoError, type DbClient } from "./db";

/**
 * Your verdict on the interviewer's lines in a full mock interview (migration 0019): good or
 * bad, and for a bad line what it should have asked. The labels of the interviewer eval set
 * (lib/interview/eval.ts). One per line; rating it again replaces it; null clears it.
 */
const TABLE = "interviewer_ratings";
const MAX_BETTER = 400;

export type LineRating = "good" | "bad";

export interface InterviewerRating {
  sessionId: string;
  turnIndex: number;
  rating: LineRating;
  better: string | null;
}

export async function listInterviewerRatings(db: DbClient, userId: string, sessionId?: string): Promise<InterviewerRating[]> {
  let q = db.from(TABLE).select("session_id,turn_index,rating,better").eq("user_id", userId);
  if (sessionId) q = q.eq("session_id", sessionId);
  const rows = await many(q.order("updated_at", { ascending: false }).limit(LIST_LIMIT), TABLE, "list");
  return rows
    .map((r) => ({ sessionId: r.session_id, turnIndex: r.turn_index, rating: r.rating, better: r.better ?? null }))
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.turnIndex - b.turnIndex);
}

export async function rateInterviewerLine(
  db: DbClient,
  userId: string,
  input: { sessionId: string; turnIndex: number; rating: LineRating | null; better?: string | null },
): Promise<void> {
  if (input.rating === null) {
    const { error } = await db.from(TABLE).delete().eq("user_id", userId).eq("session_id", input.sessionId).eq("turn_index", input.turnIndex);
    if (error) throw new RepoError(TABLE, "clear", error.message);
    return;
  }
  const better = input.rating === "bad" ? input.better?.replace(/\s+/g, " ").trim().slice(0, MAX_BETTER) || null : null;
  await one(
    db
      .from(TABLE)
      .upsert(
        { user_id: userId, session_id: input.sessionId, turn_index: input.turnIndex, rating: input.rating, better, updated_at: new Date().toISOString() },
        { onConflict: "user_id,session_id,turn_index" },
      )
      .select()
      .single(),
    TABLE,
    "rate",
  );
}
