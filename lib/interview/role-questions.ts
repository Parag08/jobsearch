import { z } from "zod";
import type { Application } from "../types";
import { COMPANY_GROUP, type CompanyQuestion } from "./company-questions";

/**
 * Role interviews: questions prepared for one application's real interview, by an agent
 * over MCP (`upsert_interview_questions`) from research the user asked for - candidate
 * reports, the recruiter's email, the job description.
 *
 * They sit with the company's questions on the interview tab (Company chooser) and run
 * through the same notes, mock interview and scoring path. Each carries its own rubric
 * (`lookFor`), what the interviewer should know (`context`, labelled "Interview brief",
 * never presented as the job description), and who the interviewer is (`interviewer`), so
 * the mock is not run as a consulting partner when the real round is an engineer.
 *
 * Stored in interview_role_questions (migration 0012); question id `role:<row id>`, so
 * written answers and attempts stay with the question when it is re-pushed.
 */

const PREFIX = "role:";

export const roleQuestionId = (storedId: string) => `${PREFIX}${storedId}`;
export const isRoleQuestionId = (id: string) => id.startsWith(PREFIX);
export const storedRoleIdOf = (id: string): string | null =>
  isRoleQuestionId(id) && id.length > PREFIX.length ? id.slice(PREFIX.length) : null;

/** Bounds on what an agent may store; over a limit is refused, never cut. */
export const ROLE_QUESTION_LIMITS = {
  text: 500,
  short: 80,
  lookFor: 1000,
  context: 1500,
  round: 120,
  interviewer: 160,
  source: 300,
  perSet: 40,
} as const;

const L = ROLE_QUESTION_LIMITS;
const opt = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

export const RoleQuestionInputSchema = z.object({
  externalRef: z.string().trim().min(1).max(200),
  competency: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(L.text),
  short: opt(L.short),
  lookFor: z.string().trim().min(1).max(L.lookFor),
  context: opt(L.context),
  source: opt(L.source),
});
export type RoleQuestionInput = z.infer<typeof RoleQuestionInputSchema>;

export const RoleInterviewInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    externalRef: z.string().min(1).optional(),
    /** The round these questions are for, e.g. "Technical interview, 24 Nov". */
    round: opt(L.round),
    /** Who asks them, e.g. "a Deployed Engineer at Cognition". Sets the mock interviewer. */
    interviewer: opt(L.interviewer),
    questions: z.array(RoleQuestionInputSchema).min(1).max(L.perSet),
  })
  .refine((r) => r.id || r.externalRef, "give the application's id or externalRef")
  .superRefine((r, ctx) => {
    const seen = new Set<string>();
    for (const q of r.questions) {
      if (seen.has(q.externalRef)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `question "${q.externalRef}" appears twice` });
      seen.add(q.externalRef);
    }
  });
export type RoleInterviewInput = z.infer<typeof RoleInterviewInputSchema>;

export interface StoredRoleQuestion {
  id: string;
  applicationId: string;
  externalRef: string;
  round: string | null;
  interviewer: string | null;
  position: number;
  competency: string;
  text: string;
  short: string | null;
  lookFor: string;
  context: string | null;
  source: string | null;
  updatedAt: string;
}

export interface RoleQuestion extends CompanyQuestion {
  round: string | null;
  interviewer: string | null;
  source: string | null;
  /** How the UI and prompts name `context`. */
  contextLabel: string;
}

export const ROLE_CONTEXT_LABEL = "Interview brief";

/**
 * Stored questions as interview-tab questions, grouped by application in position order.
 * A question whose application is closed or deleted is left out, like company questions.
 */
export function roleQuestions(stored: StoredRoleQuestion[], apps: Application[]): RoleQuestion[] {
  const live = new Map(apps.filter((a) => a.closedReason === null && a.company.trim()).map((a) => [a.id, a]));
  return [...stored]
    .filter((s) => live.has(s.applicationId))
    .sort((a, b) => (a.applicationId === b.applicationId ? a.position - b.position : a.applicationId < b.applicationId ? -1 : 1))
    .map((s) => ({
      id: roleQuestionId(s.id),
      group: COMPANY_GROUP.id,
      competency: s.competency,
      text: s.text,
      lookFor: s.lookFor,
      firms: [],
      company: live.get(s.applicationId)!.company.trim(),
      short: s.short ?? s.text,
      context: s.context,
      round: s.round,
      interviewer: s.interviewer,
      source: s.source,
      contextLabel: ROLE_CONTEXT_LABEL,
    }));
}
