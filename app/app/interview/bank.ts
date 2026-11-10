import "server-only";
import raw from "@/data/interview/questions.json";
import { parseQuestionBank, type Question, type QuestionBank } from "@/lib/interview/questions";
import { companyQuestions, isCompanyQuestionId, parseCompanyTemplates, type CompanyQuestion } from "@/lib/interview/company-questions";
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

/** This user's company questions, from their live applications. */
export async function listCompanyQuestions(db: DbClient, userId: string): Promise<CompanyQuestion[]> {
  return companyQuestions(await listApplications(db, userId), companyTemplates);
}

/**
 * Any question by id - from the bank, or one of this user's company questions - plus the
 * context the interviewer may use (only the job description's facts; null for the bank).
 */
export async function findQuestion(
  db: DbClient,
  userId: string,
  id: string,
): Promise<{ question: Question; context: string | null } | null> {
  if (!isCompanyQuestionId(id)) {
    const q = questionBank.questions.find((x) => x.id === id);
    return q ? { question: q, context: null } : null;
  }
  const q = (await listCompanyQuestions(db, userId)).find((x) => x.id === id);
  return q ? { question: q, context: q.context } : null;
}
