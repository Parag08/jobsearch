import { listAnswers, listAttempts } from "../repos/answers";
import { listRoleQuestions } from "../repos/role-questions";
import { listModelAnswers } from "../repos/model-answers";
import { roleQuestionId } from "../interview/role-questions";
import { findApplication, type AgentDeps, type ApplicationRef } from "./agent-sync";
import { questionTexts } from "./agent-prep";
import { listRolePlays } from "../repos/role-plays";
import { listFullSessions } from "../repos/full-sessions";
import { rolePlayBasis } from "../interview/role-play";
import { fullTranscript, topicsAsked } from "../interview/full-session";

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
  // Every kind of question id: bank, company, role and the user's own (bank ones came back null).
  const texts = await questionTexts(deps, userId);

  let ids: string[] | null = null;
  let appId: string | null = null;
  if (q.id || q.externalRef) {
    const app = await findApplication(deps, userId, { id: q.id, externalRef: q.externalRef });
    appId = app.id;
    ids = role.filter((r) => r.applicationId === app.id).map((r) => roleQuestionId(r.id));
  } else if (q.questionIds?.length) {
    ids = q.questionIds;
  }

  const since = q.since ?? "";
  const attempts = (await listAttempts(db, userId)).filter((a) => a.createdAt >= since && (!ids || ids.includes(a.questionId)));
  const answers = new Map((await listAnswers(db, userId)).map((a) => [a.questionId, a]));
  const models = new Map((await listModelAnswers(db, userId)).map((m) => [m.questionId, m]));
  const plays = new Map((await listRolePlays(db, userId).catch(() => [])).map((p) => [p.questionId, p]));

  const order = ids ?? [...new Set(attempts.map((a) => a.questionId))];
  const questions = order.map((questionId) => {
    const written = answers.get(questionId);
    const mine = attempts.filter((a) => a.questionId === questionId);
    return {
      questionId,
      text: texts.get(questionId) ?? null,
      writtenAnswer: written
        ? { mode: written.mode, body: written.body, situation: written.situation, task: written.task, action: written.action, result: written.result, updatedAt: written.updatedAt }
        : null,
      modelAnswer: models.get(questionId) ?? null,
      rolePlay: rolePlayOut(plays.get(questionId), models.get(questionId)?.text),
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
  // Full mock interviews: one application's, or (no application given) every one since `since`.
  const sessions = (await listFullSessions(db, userId, appId ?? undefined).catch(() => []))
    .filter((f) => appId || (!q.questionIds?.length && f.createdAt >= since))
    .slice(0, q.attemptsPerQuestion);
  const fullInterviews = sessions.map((f) => {
    const s = f.session;
    const text = (id: string) => s.plan.topics.find((t) => t.id === id)?.text ?? id;
    return {
      id: f.id,
      at: f.createdAt,
      status: f.status,
      company: s.plan.company || null,
      round: s.plan.round,
      overall: f.overall,
      scores: f.scores,
      strengths: f.strengths,
      improvements: f.improvements,
      perTopic: f.perTopic.map((p) => ({ ...p, topic: text(p.topicId) })),
      moments: f.moments.map((m) => ({ ...m, topic: text(m.topicId) })),
      path: topicsAsked(s).map((id) => ({
        topicId: id,
        topic: text(id),
        moves: s.turns.filter((t) => t.topicId === id && t.move && (t.move === "deepen" || t.move.startsWith("probe:"))).map((t) => t.move!),
      })),
      transcript: fullTranscript(s),
    };
  });
  return { questions, fullInterviews };
}

function rolePlayOut(p: Awaited<ReturnType<typeof listRolePlays>>[number] | undefined, model: string | undefined) {
  if (!p) return null;
  return { source: p.source, lines: p.lines, stale: Boolean(model && p.basedOn !== rolePlayBasis(model)), updatedAt: p.updatedAt };
}
