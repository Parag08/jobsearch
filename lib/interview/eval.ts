import { z } from "zod";
import { samePoint } from "./grounding";
import { lineProblems, parseFullSession, type FullSession, type LineProblem, type Move } from "./full-session";
import type { InterviewerRating, LineRating } from "../repos/interviewer-ratings";

/**
 * The interviewer eval set (docs/FULL-INTERVIEW.md, "Measuring the interviewer").
 *
 * A case is one decision the interviewer made in a finished full interview: the interview as it
 * stood just before an answer (what the interviewer could see), the answer, what it said next,
 * and your rating of that line if you gave one. Replaying a case through the current
 * interviewer (lib/interview/full-turn.ts) and scoring the new line answers "is it better now?".
 *
 * Scoring is rules first, zero tokens: the guards' own rules (lineProblems) on the model's raw
 * line, plus "same-as-bad" when it says again what you marked bad. An optional judge model
 * grades 1-5 how close the line is to what a sharp human interviewer would ask - the only check
 * that sees judgement, so it is opt-in and billed.
 */

export const EVAL_SET_VERSION = 1;

export interface EvalCase {
  /** `<session id>:<turn index of the interviewer line>` */
  id: string;
  sessionId: string;
  turnIndex: number;
  /** The interview just before the answer, still running. */
  session: FullSession;
  /** The answer the interviewer replied to. */
  latest: string;
  /** The candidate's written notes for the topic (legal moves check numbers against them). */
  written: string;
  /** What the interviewer actually said then. */
  recorded: { move: Move; say: string };
  rating?: LineRating;
  better?: string | null;
}

export interface EvalSet {
  version: typeof EVAL_SET_VERSION;
  exportedAt: string;
  cases: EvalCase[];
}

/** One case per interviewer decision in each finished interview: not the opener, not the close. */
export function buildEvalSet(
  sessions: { id: string; session: FullSession }[],
  ratings: InterviewerRating[],
  written: Record<string, string>,
  now: string,
): EvalSet {
  const rated = new Map(ratings.map((r) => [`${r.sessionId}:${r.turnIndex}`, r]));
  const cases: EvalCase[] = [];
  for (const { id, session } of sessions) {
    if (session.status !== "done") continue;
    session.turns.forEach((t, i) => {
      const prev = session.turns[i - 1];
      if (t.role !== "interviewer" || !t.move || t.move === "close" || prev?.role !== "candidate") return;
      const before = session.turns.slice(0, i - 1);
      const caseId = `${id}:${i}`;
      const r = rated.get(caseId);
      const c: EvalCase = {
        id: caseId,
        sessionId: id,
        turnIndex: i,
        session: { ...session, status: "running", turns: before },
        latest: prev.text,
        written: written[prev.topicId] ?? "",
        recorded: { move: t.move, say: t.text },
      };
      if (r) {
        c.rating = r.rating;
        c.better = r.better;
      }
      cases.push(c);
    });
  }
  return { version: EVAL_SET_VERSION, exportedAt: now, cases };
}

const CaseSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  turnIndex: z.number().int().min(0),
  session: z.unknown().transform((v) => parseFullSession(v)),
  latest: z.string(),
  written: z.string(),
  recorded: z.object({ move: z.string(), say: z.string() }),
  rating: z.enum(["good", "bad"]).optional(),
  better: z.string().nullable().optional(),
});

export function parseEvalSet(raw: unknown): EvalSet {
  return z
    .object({ version: z.literal(EVAL_SET_VERSION), exportedAt: z.string(), cases: z.array(CaseSchema) })
    .parse(raw) as EvalSet;
}

// ---- scoring -------------------------------------------------------------------------------

export type EvalProblem = LineProblem | "same-as-bad";

export interface Judgement {
  score: number;
  why: string;
}

export interface LineScore {
  id: string;
  move: Move;
  line: string;
  problems: EvalProblem[];
  judge?: Judgement;
}

export function scoreLine(c: EvalCase, move: Move, line: string): LineScore {
  const problems: EvalProblem[] = lineProblems(c.session, c.latest, move, line);
  if (c.rating === "bad" && line && samePoint(line, c.recorded.say)) problems.push("same-as-bad");
  return { id: c.id, move, line, problems };
}

export interface EvalSummary {
  cases: number;
  /** Lines with no rule problem. */
  clean: number;
  problems: Partial<Record<EvalProblem, number>>;
  /** probe / deepen / next: what the interviewer chose to do. */
  moves: Record<string, number>;
  ratedBad: number;
  /** Of the lines you marked bad, how many it said again. */
  badRepeated: number;
  judge?: { scored: number; average: number };
}

/** `cases` in the same order as `scores`. */
export function summarize(scores: LineScore[], cases: EvalCase[]): EvalSummary {
  const problems: Partial<Record<EvalProblem, number>> = {};
  const moves: Record<string, number> = {};
  for (const s of scores) {
    for (const p of s.problems) problems[p] = (problems[p] ?? 0) + 1;
    const kind = s.move.split(":")[0];
    moves[kind] = (moves[kind] ?? 0) + 1;
  }
  const judged = scores.flatMap((s) => (s.judge ? [s.judge.score] : []));
  const out: EvalSummary = {
    cases: scores.length,
    clean: scores.filter((s) => !s.problems.length).length,
    problems,
    moves,
    ratedBad: cases.filter((c) => c.rating === "bad").length,
    badRepeated: scores.filter((s) => s.problems.includes("same-as-bad")).length,
  };
  if (judged.length) out.judge = { scored: judged.length, average: Math.round((judged.reduce((a, b) => a + b, 0) / judged.length) * 100) / 100 };
  return out;
}

// ---- the judge (opt-in) --------------------------------------------------------------------

const JUDGE_TURNS = 8;

/** The conversation, the line, and your labels. Never the model answer: the judge grades the interviewer, not the candidate. */
export function buildJudgePrompt(c: EvalCase, line: string): string {
  const topic = c.session.plan.topics.find((t) => t.id === c.session.turns.at(-1)?.topicId);
  const recent = c.session.turns.slice(-JUDGE_TURNS).map((t) => `${t.role === "interviewer" ? "Interviewer" : "Candidate"}: ${t.text}`);
  return [
    "You grade one line from an AI interviewer in a mock job interview. Judge it as an expert human interviewer would.",
    topic ? `Current topic: ${topic.text} (a strong answer shows: ${topic.lookFor})` : "",
    "",
    "The conversation:",
    ...recent,
    `Candidate: ${c.latest}`,
    "",
    `The interviewer's next line: "${line}"`,
    "",
    c.rating === "bad" ? `The candidate marked this earlier line at the same moment as poor: "${c.recorded.say}"` : "",
    c.rating === "good" ? `The candidate marked this earlier line at the same moment as good: "${c.recorded.say}"` : "",
    c.better ? `The candidate said a great interviewer would have asked: "${c.better}"` : "",
    "",
    "Score 1-5:",
    "5 = what a sharp, experienced interviewer would ask: it picks up the most revealing thing just said, opens a new thread or rightly moves on, one short natural question.",
    "3 = acceptable but generic, or chases something minor.",
    "1 = repeats a settled point, uses facts the candidate never said, asks several things at once, or makes no sense here.",
    "Moving on to the next topic is right when the current one is covered.",
    "",
    'Reply with JSON only: {"score": 1-5, "why": "one short sentence"}',
  ]
    .filter((l, i, all) => l !== "" || (all[i - 1] !== "" && i > 0))
    .join("\n");
}

export function parseJudge(raw: unknown): Judgement {
  const j = z.object({ score: z.coerce.number().int().min(1).max(5), why: z.coerce.string().default("") }).parse(raw);
  return { score: j.score, why: j.why.replace(/\s+/g, " ").trim() };
}
