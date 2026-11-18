import type { Application } from "../types";
import { listApplications } from "../repos/applications";
import { listRoleQuestions, removeRoleQuestions, upsertRoleQuestions } from "../repos/role-questions";
import { roleQuestionId, type RoleInterviewInput } from "../interview/role-questions";
import { findApplication, type AgentDeps, type ApplicationRef } from "./agent-sync";

/**
 * What an agent may do to a user's role interviews (MCP tools upsert_interview_questions,
 * list_interview_questions, remove_interview_questions). Questions always belong to an
 * application the user already has; a set is idempotent on each question's externalRef.
 * Order is the order sent, so the set reads like the interview it prepares for.
 */

const appBrief = (a: Application) => ({ id: a.id, externalRef: a.externalRef ?? null, company: a.company, role: a.role, stage: a.stage });

export async function saveRoleInterview(deps: AgentDeps, userId: string, input: RoleInterviewInput, nowIso: string) {
  const app = await findApplication(deps, userId, { id: input.id, externalRef: input.externalRef });
  const counts = await upsertRoleQuestions(
    deps.db,
    userId,
    app.id,
    input.questions.map((q, i) => ({
      externalRef: q.externalRef,
      round: input.round ?? null,
      interviewer: input.interviewer ?? null,
      position: i,
      competency: q.competency,
      text: q.text,
      short: q.short ?? null,
      lookFor: q.lookFor,
      context: q.context ?? null,
      source: q.source ?? null,
    })),
    nowIso,
  );
  return { application: appBrief(app), ...counts };
}

/** One application's questions, or every application's when no ref is given. */
export async function listRoleInterview(deps: AgentDeps, userId: string, ref: ApplicationRef) {
  const app = ref.id || ref.externalRef ? await findApplication(deps, userId, ref) : null;
  const apps = new Map((await listApplications(deps.db, userId)).map((a) => [a.id, a]));
  const questions = (await listRoleQuestions(deps.db, userId)).filter((q) => !app || q.applicationId === app.id);
  return {
    questions: questions.map((q) => {
      const a = apps.get(q.applicationId);
      return {
        questionId: roleQuestionId(q.id),
        externalRef: q.externalRef,
        company: a?.company ?? null,
        role: a?.role ?? null,
        round: q.round,
        interviewer: q.interviewer,
        competency: q.competency,
        text: q.text,
        updatedAt: q.updatedAt,
      };
    }),
  };
}

export async function removeRoleInterview(deps: AgentDeps, userId: string, externalRefs: string[]) {
  return { removed: await removeRoleQuestions(deps.db, userId, externalRefs) };
}
