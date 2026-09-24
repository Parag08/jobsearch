import { z } from "zod";

/**
 * The behavioural question bank (DESIGN.md section 3).
 *
 * The questions are DATA - data/interview/questions.json - so adding a firm, a group or
 * a question never touches lib/ (rule 4). This module only validates and arranges them.
 * Answers are keyed by question id, which is why ids must be unique and stable.
 */
export const QUESTION_BANK_PATH = "data/interview/questions.json";

export const QuestionSchema = z
  .object({
    id: z.string().min(1),
    group: z.string().min(1),
    /** Same labels as lib/stories DEFAULT_VOCAB where one fits; a free string otherwise. */
    competency: z.string().min(1),
    text: z.string().min(1),
    /** Firms where this is especially likely. Free strings, so a new firm is a data edit. */
    firms: z.array(z.string()),
    /** What a strong answer shows - the rubric the scorer is given. */
    lookFor: z.string().min(1),
  })
  // Firm-specific advice lives under the firm's own key ("bain": "..."), so passthrough.
  .passthrough();
export type Question = z.infer<typeof QuestionSchema>;

export const QuestionGroupSchema = z.object({ id: z.string().min(1), label: z.string().min(1) });
export type QuestionGroup = z.infer<typeof QuestionGroupSchema>;

export interface QuestionBank {
  groups: QuestionGroup[];
  questions: Question[];
}

/** Validate the bank. Throws on anything that would break answers keyed by question id. */
export function parseQuestionBank(raw: unknown): QuestionBank {
  const parsed = z
    .object({ groups: z.array(QuestionGroupSchema), questions: z.array(QuestionSchema) })
    .passthrough()
    .parse(raw);

  const seen = new Set<string>();
  for (const q of parsed.questions) {
    if (seen.has(q.id)) throw new Error(`question bank: duplicate id "${q.id}"`);
    seen.add(q.id);
  }
  const groups = new Set(parsed.groups.map((g) => g.id));
  for (const q of parsed.questions) {
    if (!groups.has(q.group)) throw new Error(`question bank: "${q.id}" names unknown group "${q.group}"`);
  }
  return { groups: parsed.groups, questions: parsed.questions };
}

/** Questions for one firm, or every question for "all". Keeps bank order. */
export function questionsForFirm(bank: QuestionBank, firm: string): Question[] {
  if (firm === "all") return bank.questions;
  return bank.questions.filter((q) => q.firms.includes(firm));
}

/** Arrange questions under their groups, in the bank's group order, dropping empty groups. */
export function groupQuestions(
  bank: QuestionBank,
  questions: Question[],
): { group: QuestionGroup; questions: Question[] }[] {
  return bank.groups
    .map((group) => ({ group, questions: questions.filter((q) => q.group === group.id) }))
    .filter((g) => g.questions.length > 0);
}

/** Firm-specific advice for a question, or null - never invented. */
export function firmNote(q: Question, firm: string): string | null {
  if (firm === "all") return null;
  const note = (q as Record<string, unknown>)[firm];
  return typeof note === "string" && note.trim() ? note : null;
}
