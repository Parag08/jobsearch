import { getModelAnswer } from "../repos/model-answers";
import { getRolePlay, putRolePlay } from "../repos/role-plays";
import { getRoleQuestion } from "../repos/role-questions";
import { getCustomQuestion } from "../repos/custom-questions";
import { listAnswers } from "../repos/answers";
import { listApplications } from "../repos/applications";
import { storedRoleIdOf } from "../interview/role-questions";
import { storedIdOf as storedCustomIdOf } from "../interview/custom-questions";
import { companyQuestions, isCompanyQuestionId } from "../interview/company-questions";
import { companyTemplates, questionBank } from "../interview/bank-data";
import { isQuestionIdShape } from "../interview/model-answer";
import { guardRolePlay, normaliseLines, rolePlayBasis, type RolePlayLine, type RolePlaySource } from "../interview/role-play";
import type { AgentDeps } from "./agent-sync";
import type { DbClient } from "../repos/db";

/**
 * Role-plays from outside the app (MCP `rolePlay` on upsert_interview_questions, and
 * set_role_play). The question must be the user's; the lines go through the same honesty guard
 * as an app-built play, against the question's current model answer and written answer. An agent
 * never replaces a play the app built unless `force`.
 */

/** The question's text if it is this user's question, else null. */
export async function questionTextFor(db: DbClient, userId: string, questionId: string): Promise<string | null> {
  if (!isQuestionIdShape(questionId)) return null;
  const roleId = storedRoleIdOf(questionId);
  if (roleId) return (await getRoleQuestion(db, userId, roleId).catch(() => null))?.text ?? null;
  const customId = storedCustomIdOf(questionId);
  if (customId) return (await getCustomQuestion(db, userId, customId).catch(() => null))?.text ?? null;
  if (isCompanyQuestionId(questionId)) {
    return companyQuestions(await listApplications(db, userId), companyTemplates).find((q) => q.id === questionId)?.text ?? null;
  }
  return questionBank.questions.find((q) => q.id === questionId)?.text ?? null;
}

/** Everything the candidate has written for a question, so their own numbers count as evidence. */
export async function writtenAnswerText(db: DbClient, userId: string, questionId: string): Promise<string> {
  const mine = (await listAnswers(db, userId)).find((a) => a.questionId === questionId);
  return mine ? [mine.body, mine.situation, mine.task, mine.action, mine.result].join(" ") : "";
}

export type SaveRolePlayResult = { saved: true } | { saved: false; keptSource: RolePlaySource };

export async function saveAgentRolePlay(
  deps: AgentDeps,
  userId: string,
  input: { questionId: string; lines: RolePlayLine[]; force?: boolean },
  nowIso: string,
): Promise<SaveRolePlayResult> {
  const { db } = deps;
  const question = await questionTextFor(db, userId, input.questionId);
  if (!question) throw new Error(`No question ${input.questionId}.`);
  const lines = normaliseLines(
    input.lines.map((l) => (l.who === "candidate" && l.why ? { who: l.who, say: l.say.trim(), why: l.why.trim() } : { who: l.who, say: l.say.trim() })),
    question,
  );
  const model = (await getModelAnswer(db, userId, input.questionId))?.text ?? "";
  const check = guardRolePlay(lines, { modelAnswer: model, written: await writtenAnswerText(db, userId, input.questionId) });
  if (!check.ok) throw new Error(`The role-play states ${check.invented.join(", ")}, which is not in the model answer or the written answer.`);

  const existing = await getRolePlay(db, userId, input.questionId);
  if (existing?.source === "ai" && !input.force) return { saved: false, keptSource: "ai" };
  await putRolePlay(db, userId, { questionId: input.questionId, lines, source: "agent", basedOn: rolePlayBasis(model), model: null }, nowIso);
  return { saved: true };
}
