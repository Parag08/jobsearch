import { MODEL_ANSWER_MAX, isQuestionIdShape, mayOverwrite, type ModelAnswerSource } from "../interview/model-answer";
import { storedRoleIdOf } from "../interview/role-questions";
import { storedIdOf as storedCustomIdOf } from "../interview/custom-questions";
import { getModelAnswer, putModelAnswer } from "../repos/model-answers";
import { getRoleQuestion } from "../repos/role-questions";
import { getCustomQuestion } from "../repos/custom-questions";
import type { AgentDeps } from "./agent-sync";

/**
 * Set the model answer for one question - the one write path, used by the MCP tools
 * (source "agent") and the app (source "ai" for a rewrite, "user" for an edit). The
 * question must be the user's: a role or custom question must exist for them; any other
 * id must be well formed. An agent never overwrites the user's own or their in-app
 * rewrite unless `force` (mayOverwrite).
 */
export interface SetModelAnswerInput {
  questionId: string;
  text: string;
  source: ModelAnswerSource;
  force?: boolean;
}

export type SetModelAnswerResult = { saved: true } | { saved: false; keptSource: ModelAnswerSource };

export async function setModelAnswer(deps: AgentDeps, userId: string, input: SetModelAnswerInput, nowIso: string): Promise<SetModelAnswerResult> {
  const { db } = deps;
  const text = input.text.trim();
  if (!text) throw new Error("A model answer cannot be empty.");
  if (text.length > MODEL_ANSWER_MAX) throw new Error(`Keep the model answer under ${MODEL_ANSWER_MAX} characters (it is ${text.length}).`);
  if (!isQuestionIdShape(input.questionId)) throw new Error(`Unknown question id "${input.questionId}".`);

  const roleId = storedRoleIdOf(input.questionId);
  if (roleId && !(await getRoleQuestion(db, userId, roleId).catch(() => null))) throw new Error(`No question ${input.questionId}.`);
  const customId = storedCustomIdOf(input.questionId);
  if (customId && !(await getCustomQuestion(db, userId, customId).catch(() => null))) throw new Error(`No question ${input.questionId}.`);

  const existing = await getModelAnswer(db, userId, input.questionId);
  if (!mayOverwrite(existing?.source ?? null, input.source, input.force ?? false)) {
    return { saved: false, keptSource: existing!.source };
  }
  await putModelAnswer(db, userId, { questionId: input.questionId, text, source: input.source }, nowIso);
  return { saved: true };
}
