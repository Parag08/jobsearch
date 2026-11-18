import { listAnswers, listAttempts } from "../repos/answers";
import { listRoleQuestions } from "../repos/role-questions";
import { roleQuestionId } from "../interview/role-questions";
import { findApplication, type AgentDeps, type ApplicationRef } from "./agent-sync";

/**
 * Read-only view of the user's interview practice for an agent (MCP tool
 * list_interview_practice): for each question, the written answer and the spoken attempts
 * (transcript of the whole mock conversation, scores, feedback), newest first. Nothing
 * here writes, and every read is filtered on the caller's userId.
 *
 * Scope, in order: one application's role-interview questions; or the question ids given;
 * or every question practised since `since`.
 */

export interface PracticeQuery extends ApplicationRef {
  questionIds?: string[];
  /** ISO date; attempts before it are left out. */
  since?: string;
  /** Attempts per question, newest first. */
  attemptsPerQuestion: number;
}

export async function listInterviewPractice(deps: AgentDeps, userId: string, q: PracticeQuery) {
  const { db } = deps;
  const role = await listRoleQuestions(db, userId);
  const roleText = new Map(role.map((r) => [roleQuestionId(r.id), r.text]));

  let ids: string[] | null = null;
  if (q.id || q.externalRef) {
    const app = await findApplication(deps, userId, { id: q.id, externalRef: q.externalRef });
    ids = role.filter((r) => r.applicationId === app.id).map((r) => roleQuestionId(r.id));
  } else if (q.questionIds?.length) {
    ids = q.questionIds;
  }

  const since = q.since ?? "";
  const attempts = (await listAttempts(db, userId)).filter((a) => a.createdAt >= since && (!ids || ids.includes(a.questionId)));
  const answers = new Map((await listAnswers(db, userId)).map((a) => [a.questionId, a]));

  const order = ids ?? [...new Set(attempts.map((a) => a.questionId))];
  const questions = order.map((questionId) => {
    const written = answers.get(questionId);
    const mine = attempts.filter((a) => a.questionId === questionId);
    return {
      questionId,
      text: roleText.get(questionId) ?? null,
      writtenAnswer: written
        ? { mode: written.mode, body: written.body, situation: written.situation, task: written.task, action: written.action, result: written.result, updatedAt: written.updatedAt }
        : null,
      attemptCount: mine.length,
      attempts: mine.slice(0, q.attemptsPerQuestion).map((a) => ({
        at: a.createdAt,
        overall: a.overall,
        scores: a.scores,
        strengths: a.strengths,
        improvements: a.improvements,
        durationSeconds: a.durationSeconds,
        transcript: a.transcript,
      })),
    };
  });
  return { questions };
}
