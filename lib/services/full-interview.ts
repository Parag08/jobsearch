import type { Application } from "../types";
import { listApplications } from "../repos/applications";
import { listRoleQuestions } from "../repos/role-questions";
import { listFullSessions, type StoredFullSession } from "../repos/full-sessions";
import { listAttempts } from "../repos/answers";
import { roleQuestions } from "../interview/role-questions";
import { companyQuestions, companySlug } from "../interview/company-questions";
import { companyTemplates, questionBank } from "../interview/bank-data";
import { inferCompetencies } from "../stories/competencies";
import { planFromBank, planFromJob, planFromRoleQuestions, type FullInterviewSettings, type FullPlan } from "../interview/full-plan";
import type { DbClient } from "../repos/db";
import { topicsAsked } from "../interview/full-session";

/**
 * Plans and cards for the full mock interview (docs/FULL-INTERVIEW.md). An application's plan
 * is the round an agent pushed for it; without one, it is built from the job description.
 */

const live = (a: Application) => a.closedReason === null && Boolean(a.company.trim());

function planFor(app: Application, apps: Application[], stored: Awaited<ReturnType<typeof listRoleQuestions>>, settings: FullInterviewSettings): FullPlan | null {
  const ref = { id: app.id, company: app.company.trim(), role: app.role.trim() };
  const mine = roleQuestions(stored.filter((s) => s.applicationId === app.id), apps);
  if (mine.length) return planFromRoleQuestions(ref, mine);
  const company = companyQuestions([app], companyTemplates);
  const competencies = app.jdExtract ? inferCompetencies(app.jdExtract) : [];
  try {
    return planFromJob(ref, company, questionBank.questions, competencies, Math.max(1, settings.maxTopics - company.length));
  } catch {
    return null;
  }
}

/** Best overall per question id, from every mock attempt. */
async function bestScores(db: DbClient, userId: string): Promise<Map<string, number>> {
  const best = new Map<string, number>();
  for (const a of await listAttempts(db, userId).catch(() => [])) best.set(a.questionId, Math.max(best.get(a.questionId) ?? 0, a.overall));
  return best;
}

/** An application's plan, or with `null` the general practice interview from the bank. */
export async function fullPlanFor(db: DbClient, userId: string, applicationId: string | null, settings: FullInterviewSettings): Promise<FullPlan | null> {
  if (applicationId === null) return planFromBank(questionBank.questions, await bestScores(db, userId), settings.maxTopics);
  const [apps, stored] = await Promise.all([listApplications(db, userId), listRoleQuestions(db, userId).catch(() => [])]);
  const app = apps.find((a) => a.id === applicationId && live(a));
  return app ? planFor(app, apps, stored, settings) : null;
}

export interface FullInterviewCard {
  /** Null for the general practice interview. */
  applicationId: string | null;
  company: string;
  slug: string;
  role: string;
  source: "role" | "job" | "general";
  round: string | null;
  interviewer: string | null;
  /** Topics in the plan (the interview asks at most settings.maxTopics of them). */
  topics: number;
  /** A session still running, to resume. */
  runningId: string | null;
  /** The newest finished session, and the best overall so far. */
  lastDoneId: string | null;
  best: number | null;
  /** Every finished, scored interview, newest first: the reports you can open again. */
  history: PastInterview[];
}

export interface PastInterview {
  id: string;
  /** When it was finished (ISO). */
  at: string;
  overall: number;
  /** How many topics it covered. */
  topics: number;
}

/** One card per live application with a plan, for the Company view of the Interview tab. */
export async function fullInterviewsFor(db: DbClient, userId: string, settings: FullInterviewSettings): Promise<FullInterviewCard[]> {
  const [apps, stored, sessions] = await Promise.all([
    listApplications(db, userId),
    listRoleQuestions(db, userId).catch(() => []),
    listFullSessions(db, userId).catch(() => []),
  ]);
  const out: FullInterviewCard[] = [];
  for (const app of apps.filter(live)) {
    const plan = planFor(app, apps, stored, settings);
    if (!plan) continue;
    out.push(card(plan, sessions.filter((s) => s.applicationId === app.id), companySlug(plan.company)));
  }
  return out;
}

function card(plan: FullPlan, mine: StoredFullSession[], slug: string): FullInterviewCard {
  const done = mine.filter((s) => s.status === "done" && s.overall !== null); // newest first
  return {
    applicationId: plan.applicationId,
    company: plan.company,
    slug,
    role: plan.role,
    source: plan.source,
    round: plan.round,
    interviewer: plan.interviewer,
    topics: plan.topics.length,
    runningId: mine.find((s) => s.status === "running")?.id ?? null,
    lastDoneId: done[0]?.id ?? null,
    best: done.length ? Math.max(...done.map((s) => s.overall!)) : null,
    history: done.map((s) => ({ id: s.id, at: s.updatedAt || s.createdAt, overall: s.overall!, topics: topicsAsked(s.session).length })),
  };
}

/** The general practice interview's card: always available, no company needed. */
export async function generalInterviewCard(db: DbClient, userId: string, settings: FullInterviewSettings): Promise<FullInterviewCard> {
  const [plan, mine] = await Promise.all([fullPlanFor(db, userId, null, settings), listFullSessions(db, userId, null).catch(() => [])]);
  return card(plan!, mine, "general");
}
