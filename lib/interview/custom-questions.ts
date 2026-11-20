import { z } from "zod";
import type { Question, QuestionGroup } from "./questions";

/**
 * Your own questions: anything you type, practised and scored exactly like a bank question.
 *
 * Stored per user (interview_custom_questions, migration 0011) and given the id
 * `custom:<row id>`, so written answers and attempts - both keyed by question id - stay
 * with the question. What a good answer looks like is shared and lives in
 * data/interview/questions.json (`customQuestion`, rule 4).
 *
 * The text is the user's own words going into a model prompt, so it is kept to one bounded
 * line here (cleanQuestionText) and marked as data in the prompt (lib/interview/mock.ts).
 */

export const CUSTOM_GROUP: QuestionGroup = { id: "custom", label: "Your questions" };
const PREFIX = "custom:";

export const customQuestionId = (storedId: string) => `${PREFIX}${storedId}`;
export const isCustomQuestionId = (id: string) => id.startsWith(PREFIX);
/** The stored row id inside a custom question id, or null for any other id. */
export const storedIdOf = (id: string): string | null => (isCustomQuestionId(id) && id.length > PREFIX.length ? id.slice(PREFIX.length) : null);

/**
 * One line, no control characters, within the limit. A question over the limit is refused
 * rather than cut: half a question is a different question.
 */
export function cleanQuestionText(raw: string, maxChars: number): { text: string } | { error: string } {
  const text = raw
    // Line and paragraph separators count as breaks; other control characters just go.
    .replace(/[\p{Zl}\p{Zp}]/gu, " ")
    .replace(/[^\P{Cc}\t\n\r]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return { error: "Type a question first." };
  if (text.length > maxChars) return { error: `Keep the question under ${maxChars} characters (it is ${text.length}).` };
  return { text };
}

export const CustomTemplateSchema = z.object({
  competency: z.string().min(1),
  /** The rubric every custom question is scored against. */
  lookFor: z.string().min(1),
});
export type CustomTemplate = z.infer<typeof CustomTemplateSchema>;
export const parseCustomTemplate = (raw: unknown): CustomTemplate => CustomTemplateSchema.parse(raw);

export interface StoredCustomQuestion {
  id: string;
  text: string;
  createdAt: string;
  /** Set when an agent added it (migration 0016): its stable id, so a re-send updates it. */
  externalRef?: string | null;
  /** What it tests; when set it replaces the shared template's competency. */
  competency?: string | null;
  /** A short label, e.g. "drill". */
  tag?: string | null;
}

/** Stored rows as questions, newest first. */
export function customQuestions(stored: StoredCustomQuestion[], template: CustomTemplate): Question[] {
  return [...stored]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .map((s) => ({
      id: customQuestionId(s.id),
      group: CUSTOM_GROUP.id,
      competency: s.competency || template.competency,
      text: s.text,
      firms: [],
      lookFor: template.lookFor,
    }));
}

/**
 * INTERVIEW_CUSTOM_QUESTION_MAX_CHARS (.env.example): the longest question you may add.
 * No in-code default: unset = undefined and adding your own question is not offered.
 */
export function customQuestionMaxCharsFromEnv(env: Record<string, string | undefined>): number | undefined {
  const raw = env.INTERVIEW_CUSTOM_QUESTION_MAX_CHARS;
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`INTERVIEW_CUSTOM_QUESTION_MAX_CHARS must be a whole number >= 1, got "${raw}"`);
  return n;
}
