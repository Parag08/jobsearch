import { listAnswers } from "../repos/answers";
import { getFullSession, listFullSessionsForEval } from "../repos/full-sessions";
import { listInterviewerRatings, rateInterviewerLine, type LineRating } from "../repos/interviewer-ratings";
import { buildEvalSet, type EvalSet } from "../interview/eval";
import { parseFullSession } from "../interview/full-session";
import type { DbClient } from "../repos/db";

/**
 * Rating the interviewer and exporting the eval set (docs/FULL-INTERVIEW.md). The export is the
 * input of `npm run interview:eval`; it holds your own interviews, so it is only ever served to you.
 */

export async function exportEvalSet(db: DbClient, userId: string, now: string): Promise<EvalSet> {
  const [stored, ratings, answers] = await Promise.all([listFullSessionsForEval(db, userId), listInterviewerRatings(db, userId), listAnswers(db, userId)]);
  const written = Object.fromEntries(answers.map((a) => [a.questionId, [a.body, a.situation, a.task, a.action, a.result].join(" ")]));
  const sessions = stored.map((s) => ({ id: s.id, session: parseFullSession(s.session) })).reverse();
  return buildEvalSet(sessions, ratings, written, now);
}

export type RateResult = { ok: true } | { ok: false; error: string };

/** Rate (or with null, un-rate) one interviewer line. The opener is code's planned question, so it is not rated. */
export async function rateLine(
  db: DbClient,
  userId: string,
  input: { sessionId: string; turnIndex: number; rating: LineRating | null; better?: string | null },
): Promise<RateResult> {
  const stored = await getFullSession(db, userId, input.sessionId);
  if (!stored) return { ok: false, error: "That interview could not be found." };
  const turn = parseFullSession(stored.session).turns[input.turnIndex];
  if (!Number.isInteger(input.turnIndex) || input.turnIndex < 1 || turn?.role !== "interviewer") {
    return { ok: false, error: "Only the interviewer's lines after your first answer can be rated." };
  }
  await rateInterviewerLine(db, userId, input);
  return { ok: true };
}
