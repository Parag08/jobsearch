import "server-only";
import raw from "@/data/interview/questions.json";
import { parseQuestionBank, type Question, type QuestionBank } from "@/lib/interview/questions";
import { companyQuestions, isCompanyQuestionId, parseCompanyTemplates, type CompanyQuestion } from "@/lib/interview/company-questions";
import { customQuestions, parseCustomTemplate, storedIdOf } from "@/lib/interview/custom-questions";
import { getCustomQuestion, listCustomQuestions as listStoredCustomQuestions } from "@/lib/repos/custom-questions";
import { roleQuestions, storedRoleIdOf, type RoleQuestion } from "@/lib/interview/role-questions";
import { getRoleQuestion, listRoleQuestions } from "@/lib/repos/role-questions";
import { listApplications } from "@/lib/repos/applications";
import type { DbClient } from "@/lib/repos/db";

/**
 * The question bank, parsed once per server instance. The data lives in
 * data/interview/questions.json (rule 4); lib/interview/questions.ts validates it,
 * and a test fails the build if the shipped file stops parsing.
 *
 * Behavioural questions are generic. Company questions ("Why Grab?") are built per user
 * from the companies in their pipeline, from the templates in the same file.
 */
export const questionBank: QuestionBank = parseQuestionBank(raw);

export const companyTemplates = parseCompanyTemplates((raw as { companyQuestions?: unknown }).companyQuestions ?? []);

/**
 * This user's company questions, from their live applications: a role interview prepared
 * for an application (role:...) first, then the "why us?" templates (company:...).
 */
export async function listCompanyQuestions(db: DbClient, userId: string): Promise<(CompanyQuestion | RoleQuestion)[]> {
  const [apps, stored] = await Promise.all([listApplications(db, userId), listRoleQuestions(db, userId).catch(() => [])]);
  return [...roleQuestions(stored, apps), ...companyQuestions(apps, companyTemplates)];
}

/** The rubric shared by every question the user typed themselves. */
export const customTemplate = parseCustomTemplate((raw as { customQuestion?: unknown }).customQuestion);

/** This user's own questions, newest first. */
export async function listCustomQuestions(db: DbClient, userId: string): Promise<Question[]> {
  return customQuestions(await listStoredCustomQuestions(db, userId), customTemplate);
}

/**
 * Any question by id - from the bank, one of this user's company questions, or one they
 * typed - plus the context the interviewer may use (only the job description's facts; null
 * otherwise). `typed` marks the user's own text, which prompts must treat as data.
 */
export async function findQuestion(
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
    return q ? { question: q, context: q.context, interviewer: q.interviewer, contextLabel: q.contextLabel, modelAnswer: q.modelAnswer } : null;
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
