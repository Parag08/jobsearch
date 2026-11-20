import type { Question } from "./questions";
import type { RoleQuestion } from "./role-questions";
import type { CompanyQuestion } from "./company-questions";

/**
 * The plan for a full mock interview (docs/FULL-INTERVIEW.md): one application's round as an
 * ordered list of topics. With role questions (pushed over MCP from research) the plan is that
 * round, in the pushed order, run by the round's interviewer. Without them it is built from the
 * job: the "Why <company>?" questions and bank questions for the competencies the job calls for.
 *
 * Pure. The plan is snapshotted on the session when it starts, so re-pushing questions later
 * never rewrites an interview already held.
 */

export type TopicKind = "opener" | "topic" | "close";

export interface PlanTopic {
  /** The question id (role:..., company:..., or a bank id), so solo practice links back. */
  id: string;
  kind: TopicKind;
  competency: string;
  text: string;
  short: string;
  lookFor: string;
  /** What the interviewer knows about this topic (the interview brief), or null. */
  context: string | null;
}

export interface FullPlan {
  /** Null for a general practice interview (no company). */
  applicationId: string | null;
  company: string;
  role: string;
  /** "role" = the round pushed by an agent; "job" = built from the job description; "general" = the bank, no company. */
  source: "role" | "job" | "general";
  round: string | null;
  /** Who interviews, e.g. "a Deployed Engineer at Cognition"; null = a generic hiring manager. */
  interviewer: string | null;
  contextLabel: string;
  topics: PlanTopic[];
}

const CLOSE_RE = /\bquestions?\b.*\b(for|to ask)\b.*\b(me|us)\b|\bwhat (would|do) you (like to )?ask\b/i;

export function topicKindOf(text: string, index: number): TopicKind {
  if (CLOSE_RE.test(text)) return "close";
  return index === 0 ? "opener" : "topic";
}

/** The close always runs last, wherever it was pushed; everything else keeps its order. */
function withCloseLast(topics: PlanTopic[]): PlanTopic[] {
  return [...topics.filter((t) => t.kind !== "close"), ...topics.filter((t) => t.kind === "close")];
}

type AppRef = { id: string; company: string; role: string };

export function planFromRoleQuestions(app: AppRef, questions: RoleQuestion[]): FullPlan {
  if (!questions.length) throw new Error("A full interview needs at least one question.");
  const first = questions[0];
  return {
    applicationId: app.id,
    company: app.company,
    role: app.role,
    source: "role",
    round: first.round,
    interviewer: first.interviewer,
    contextLabel: first.contextLabel,
    topics: withCloseLast(
      questions.map((q, i) => ({
        id: q.id,
        kind: topicKindOf(q.text, i),
        competency: q.competency,
        text: q.text,
        short: q.short,
        lookFor: q.lookFor,
        context: q.context,
      })),
    ),
  };
}

/**
 * No round was pushed: the company's own questions, then up to `bankMax` bank questions whose
 * competency the job calls for (in the order given), so the interview is about this job.
 */
export function planFromJob(app: AppRef, company: CompanyQuestion[], bank: Question[], competencies: string[], bankMax: number): FullPlan {
  const wanted = new Set(competencies);
  const fromBank = bank.filter((q) => wanted.has(q.competency)).slice(0, bankMax);
  const topics: PlanTopic[] = [
    ...company.map((q) => ({ id: q.id, competency: q.competency, text: q.text, short: q.short, lookFor: q.lookFor, context: q.context })),
    ...fromBank.map((q) => ({ id: q.id, competency: q.competency, text: q.text, short: q.text, lookFor: q.lookFor, context: null })),
  ].map((t, i) => ({ ...t, kind: topicKindOf(t.text, i) }));
  if (!topics.length) throw new Error("A full interview needs at least one question.");
  return {
    applicationId: app.id,
    company: app.company,
    role: app.role,
    source: "job",
    round: null,
    interviewer: null,
    contextLabel: "from the job description",
    topics: withCloseLast(topics),
  };
}

/** Extra topics offered beyond what one interview asks, so the interviewer has a choice of what comes next. */
const SPARE_TOPICS = 2;

/**
 * General practice, with no interview coming up: a behavioural round from the bank. Opens on
 * the bank's first question, then one question per other group - groups never practised first,
 * then the weakest by best score - and within a group the unpractised or weakest question.
 */
export function planFromBank(bank: Question[], best: ReadonlyMap<string, number>, maxTopics: number): FullPlan {
  const [opener, ...rest] = bank;
  if (!opener) throw new Error("A full interview needs at least one question.");
  const score = (id: string) => best.get(id) ?? -1;
  const groups = new Map<string, Question[]>();
  for (const q of rest) if (q.group !== opener.group) groups.set(q.group, [...(groups.get(q.group) ?? []), q]);
  const picks = [...groups.values()]
    .map((qs) => [...qs].sort((a, b) => score(a.id) - score(b.id))[0])
    .map((q, i) => ({ q, i, groupBest: Math.max(...(groups.get(q.group) ?? []).map((x) => score(x.id))) }))
    .sort((a, b) => (a.groupBest === b.groupBest ? a.i - b.i : a.groupBest - b.groupBest))
    .map((x) => x.q);
  const chosen = [opener, ...picks].slice(0, maxTopics + SPARE_TOPICS);
  return {
    applicationId: null,
    company: "",
    role: "",
    source: "general",
    round: "General behavioural interview",
    interviewer: null,
    contextLabel: "from the question bank",
    topics: chosen.map((q, i) => ({ id: q.id, kind: topicKindOf(q.text, i), competency: q.competency, text: q.text, short: q.text, lookFor: q.lookFor, context: null })),
  };
}

export interface FullInterviewSettings {
  /** Most topics asked in one interview, close included (a real round never covers everything). */
  maxTopics: number;
  /** Most follow-ups (probes and "why" deeper) on one topic. */
  topicFollowUps: number;
  /** Most follow-ups across the whole interview. */
  totalFollowUps: number;
}

const KEYS = {
  maxTopics: ["INTERVIEW_FULL_MAX_TOPICS", 2],
  topicFollowUps: ["INTERVIEW_FULL_TOPIC_FOLLOW_UPS", 0],
  totalFollowUps: ["INTERVIEW_FULL_TOTAL_FOLLOW_UPS", 0],
} as const;

/** From env (.env.example: INTERVIEW_FULL_*). Any unset = the full interview is off; never a made-up default. */
export function fullInterviewSettingsFromEnv(env: Record<string, string | undefined>): FullInterviewSettings | null {
  const out: Partial<FullInterviewSettings> = {};
  for (const [key, [name, min]] of Object.entries(KEYS) as [keyof FullInterviewSettings, readonly [string, number]][]) {
    const raw = env[name];
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min) throw new Error(`${name} must be a whole number >= ${min}, got "${raw}"`);
    out[key] = n;
  }
  return out as FullInterviewSettings;
}
