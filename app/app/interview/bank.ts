import "server-only";
import raw from "@/data/interview/questions.json";
import { parseQuestionBank, type QuestionBank } from "@/lib/interview/questions";

/**
 * The question bank, parsed once per server instance. The data lives in
 * data/interview/questions.json (rule 4); lib/interview/questions.ts validates it,
 * and a test fails the build if the shipped file stops parsing.
 */
export const questionBank: QuestionBank = parseQuestionBank(raw);

/** Firms offered in the filter: every firm any question names, in first-seen order. */
export const FIRMS: string[] = [...new Set(questionBank.questions.flatMap((q) => q.firms))];

const labels = (raw as { firmLabels?: Record<string, string> }).firmLabels ?? {};

/** Display name for a firm id, from the data file; a capitalised id if the file has none. */
export function firmLabel(firm: string): string {
  if (firm === "all") return "All firms";
  return labels[firm] ?? firm.charAt(0).toUpperCase() + firm.slice(1);
}
