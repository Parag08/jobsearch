import raw from "../../data/interview/questions.json";
import { parseQuestionBank, type QuestionBank } from "./questions";
import { parseCompanyTemplates } from "./company-questions";
import { parseCustomTemplate } from "./custom-questions";

/**
 * The shipped question bank, parsed once (data/interview/questions.json, rule 4). Shared by
 * the Interview pages (app/app/interview/bank.ts) and the MCP tools, so both read the same
 * questions, competencies and rubrics. Imported, not read from disk, so Vercel bundles it.
 */
export const questionBank: QuestionBank = parseQuestionBank(raw);
export const companyTemplates = parseCompanyTemplates((raw as { companyQuestions?: unknown }).companyQuestions ?? []);
/** The rubric shared by every question the user (or an agent) typed. */
export const customTemplate = parseCustomTemplate((raw as { customQuestion?: unknown }).customQuestion);
