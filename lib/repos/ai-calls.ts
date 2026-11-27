import { RepoError, type DbClient } from "./db";

/**
 * The per-user model call count (migration 0025). The window lives in the database, so it holds
 * across serverless instances, and only the take_ai_call function can write it: a user cannot
 * reset their own count from the browser.
 */
export type AiCallDecision = { allowed: true } | { allowed: false; retryAfterSec: number };

export async function takeAiCall(db: DbClient, userId: string, limit: { calls: number; windowSeconds: number }): Promise<AiCallDecision> {
  const { data, error } = await db.rpc("take_ai_call", { p_user_id: userId, p_limit: limit.calls, p_window_seconds: limit.windowSeconds });
  if (error) throw new RepoError("ai_calls", "take", error.message);
  if (data === 0) return { allowed: true };
  return { allowed: false, retryAfterSec: typeof data === "number" && data > 0 ? data : limit.windowSeconds };
}
