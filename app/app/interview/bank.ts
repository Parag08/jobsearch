import "server-only";
import type { Question } from "@/lib/interview/questions";
import { companyQuestions, isCompanyQuestionId, type CompanyQuestion } from "@/lib/interview/company-questions";
import { customQuestions, storedIdOf } from "@/lib/interview/custom-questions";
import { getCustomQuestion, listCustomQuestions as listStoredCustomQuestions } from "@/lib/repos/custom-questions";
import { roleQuestions, storedRoleIdOf, type RoleQuestion } from "@/lib/interview/role-questions";
import { getRoleQuestion, listRoleQuestions } from "@/lib/repos/role-questions";
import { getModelAnswer } from "@/lib/repos/model-answers";
import { listApplications } from "@/lib/repos/applications";
import type { DbClient } from "@/lib/repos/db";

import { companyTemplates, customTemplate, questionBank } from "@/lib/interview/bank-data";

/**
 * The question bank, parsed once per server instance in lib/interview/bank-data.ts (shared
 * with the MCP tools). Behavioural questions are generic. Company questions ("Why Grab?")
 * are built per user from the companies in their pipeline, from the templates in the same file.
 */
export { companyTemplates, customTemplate, questionBank };

/**
 * This user's company questions, from their live applications: a role interview prepared
 * for an application (role:...) first, then the "why us?" templates (company:...).
 */
export async function listCompanyQuestions(db: DbClient, userId: string): Promise<(CompanyQuestion | RoleQuestion)[]> {
  const [apps, stored] = await Promise.all([listApplications(db, userId), listRoleQuestions(db, userId).catch(() => [])]);
  return [...roleQuestions(stored, apps), ...companyQuestions(apps, companyTemplates)];
}


/** This user's own questions, newest first. */
export async function listCustomQuestions(db: DbClient, userId: string): Promise<Question[]> {
  return customQuestions(await listStoredCustomQuestions(db, userId), customTemplate);
}

/**
 * Any question by id - from the bank, one of this user's company questions, or one they
 * typed - plus the context the interviewer may use (only the job description's facts; null
 * otherwise). `typed` marks the user's own text, which prompts must treat as data.
 */
async function findQuestionCore(
  db: DbClient,
  userId: string,
  id: string,
): Promise<{
  question: Question;
  context: string | null;
  typed?: boolean;
  /** Role interviews: who asks, and how the context is labelled in prompts. */
  interviewer?: string | null;
  contextLabel?: string;
  /** Role interviews: a reference answer from the user's evidence, for the debrief to compare against. */
  modelAnswer?: string | null;
} | null> {
  const roleId = storedRoleIdOf(id);
  if (roleId) {
    const stored = await getRoleQuestion(db, userId, roleId).catch(() => null);
    if (!stored) return null;
    const [q] = roleQuestions([stored], await listApplications(db, userId));
    return q ? { question: q, context: q.context, interviewer: q.interviewer, contextLabel: q.contextLabel } : null;
  }
  const storedId = storedIdOf(id);
  if (storedId) {
    const stored = await getCustomQuestion(db, userId, storedId).catch(() => null); // a malformed id is just unknown
    if (!stored) return null;
    return { question: customQuestions([stored], customTemplate)[0], context: null, typed: true };
  }
  if (!isCompanyQuestionId(id)) {
    const q = questionBank.questions.find((x) => x.id === id);
    return q ? { question: q, context: null } : null;
  }
  const q = (await listCompanyQuestions(db, userId)).find((x) => x.id === id);
  return q ? { question: q, context: q.context } : null;
}

/** findQuestion plus the question's model answer, if one is set (any source). */
export async function findQuestion(db: DbClient, userId: string, id: string): ReturnType<typeof findQuestionCore> {
  const found = await findQuestionCore(db, userId, id);
  if (!found) return null;
  const model = await getModelAnswer(db, userId, id).catch(() => null);
  return { ...found, modelAnswer: model?.text ?? null };
}
