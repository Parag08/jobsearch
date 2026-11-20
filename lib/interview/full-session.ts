import { z } from "zod";
import { canonicalNumber, extractNumbers } from "../stories/consistency";
import { DIMENSION_HELP, SCORE_DIMENSIONS, parseScore, type Scores } from "./score";
import {
  FOLLOW_UP_FALLBACK,
  MIN_FEEDBACK_WORDS,
  PROBE_HELP,
  PROBE_KINDS,
  REFERENCE_RULE,
  TONES,
  VERDICTS,
  probeCandidates,
  type MockSession,
  type ProbeKind,
  type Tone,
  type Verdict,
} from "./mock";
import type { FullInterviewSettings, FullPlan, PlanTopic } from "./full-plan";

/**
 * A full mock interview (docs/FULL-INTERVIEW.md): one round, many topics, one debrief.
 *
 * The case interviewer's split again. CODE owns the graph: which moves are legal after each
 * answer (probe a weakness the rules found, go one "why" deeper, move to one of the next two
 * topics, or end), the per-topic and total follow-up caps, and that the close comes last. The
 * MODEL (a stronger tier, since this is judgement) only picks one of the legal moves and
 * phrases it. Guards: an illegal move becomes code's first choice; a "next" always asks the
 * planned question verbatim (the model may only add a short bridge before it); a line stating
 * a number nobody said is replaced. When there is no real choice, no model is called.
 */

export type Assessment = "strong" | "adequate" | "weak";
const ASSESSMENTS: readonly Assessment[] = ["strong", "adequate", "weak"];

/** "probe:<kind>" | "deepen" | "next:<topicId>" | "close" */
export type Move = string;

export interface FullTurn {
  role: "interviewer" | "candidate";
  text: string;
  /** The topic this line belongs to; an interviewer "next" line belongs to the topic it opens. */
  topicId: string;
  at: string;
  /** Interviewer lines after the opening: the move that produced it. */
  move?: Move;
  /** The interviewer's private read of the answer just given, for the debrief. */
  assessment?: Assessment;
  note?: string;
}

export interface FullSession {
  plan: FullPlan;
  settings: FullInterviewSettings;
  tone: Tone;
  status: "running" | "done";
  turns: FullTurn[];
}

export interface FullReply {
  move: Move;
  /** For probe/deepen: the line. For next: an optional bridge before the planned question. */
  say: string;
  assessment?: Assessment;
  note?: string;
}

export const DEEPEN_FALLBACK = "Let's go one level deeper. Why that approach, and what alternative did you rule out?";
export const FULL_CLOSING_LINE = "Thank you - that's everything from me today. Your feedback will be ready in a moment.";

export function startFull(plan: FullPlan, settings: FullInterviewSettings, tone: Tone, now: string): FullSession {
  const first = plan.topics[0];
  if (!first) throw new Error("A full interview needs at least one question.");
  return { plan, settings, tone, status: "running", turns: [{ role: "interviewer", text: first.text, topicId: first.id, at: now }] };
}

export function currentTopicId(s: FullSession): string {
  return s.turns.filter((t) => t.role === "interviewer").at(-1)?.topicId ?? s.plan.topics[0].id;
}

/** Topics asked so far, in order. */
export function topicsAsked(s: FullSession): string[] {
  const out: string[] = [];
  for (const t of s.turns) if (t.role === "interviewer" && !out.includes(t.topicId)) out.push(t.topicId);
  return out;
}

const isFollowUp = (t: FullTurn) => t.role === "interviewer" && (t.move === "deepen" || Boolean(t.move?.startsWith("probe:")));
const probeOf = (m: Move | undefined): ProbeKind | undefined =>
  m?.startsWith("probe:") ? PROBE_KINDS.find((k) => k === m.slice("probe:".length)) : undefined;
const topicOf = (plan: FullPlan, id: string): PlanTopic | undefined => plan.topics.find((t) => t.id === id);

/** One topic's turns, seen as a single-question mock, so the behavioural rules apply unchanged. */
function topicView(s: FullSession, topicId: string): MockSession {
  return {
    questionId: topicId,
    tone: s.tone,
    maxFollowUps: 4,
    status: "running",
    turns: s.turns
      .filter((t) => t.topicId === topicId)
      .map((t) => {
        const probe = probeOf(t.move);
        return probe ? { role: t.role, text: t.text, at: t.at, probe } : { role: t.role, text: t.text, at: t.at };
      }),
  };
}

/**
 * The moves allowed after `latest`, code's own choice first. `written` is the candidate's
 * written answer for the current topic (numbers said aloud are checked against it).
 */
export function legalMoves(s: FullSession, latest: string, written: string): Move[] {
  const curId = currentTopicId(s);
  const cur = topicOf(s.plan, curId);
  if (!cur || cur.kind === "close") return ["close"];

  const asked = new Set(topicsAsked(s));
  const remaining = s.plan.topics.filter((t) => !asked.has(t.id));
  const closeTopic = remaining.find((t) => t.kind === "close");
  const room = s.settings.maxTopics - asked.size;
  let nexts: Move[] = [];
  if (room > 0) {
    if (closeTopic && room === 1) nexts = [`next:${closeTopic.id}`];
    else {
      nexts = remaining.filter((t) => t.kind !== "close").slice(0, 2).map((t) => `next:${t.id}`);
      if (!nexts.length && closeTopic) nexts = [`next:${closeTopic.id}`];
    }
  }
  const ends: Move[] = nexts.length ? nexts : ["close"];

  const onTopic = s.turns.filter((t) => t.topicId === curId && isFollowUp(t)).length;
  const total = s.turns.filter(isFollowUp).length;
  const mayFollowUp = onTopic < s.settings.topicFollowUps && total < s.settings.totalFollowUps;
  if (!mayFollowUp) return ends;

  const gaps: Move[] = probeCandidates(topicView(s, curId), latest, written)
    .filter((k) => k !== "depth")
    .map((k) => `probe:${k}`);
  if (gaps.length) return [...gaps, "deepen", ...ends];
  if (onTopic === 0) return ["deepen", ...ends];
  return [...ends, "deepen"];
}

/** A model call is worth it only when there is a real choice to make. */
export function needsModel(legal: Move[]): boolean {
  return legal.length > 1;
}

/** Code's own line for a move - used when the model fails, is guarded out, or is not needed. */
export function fallbackReply(legal: Move[]): FullReply {
  const move = legal[0] ?? "close";
  return { move, say: stockLine(move) };
}

function stockLine(move: Move): string {
  const probe = probeOf(move);
  if (probe) return FOLLOW_UP_FALLBACK[probe];
  return move === "deepen" ? DEEPEN_FALLBACK : "";
}

const MAX_SAY = 400;
const MAX_NOTE = 240;

export function parseFullReply(raw: unknown, legal: Move[]): FullReply {
  const parsed = z
    .object({ move: z.coerce.string(), say: z.coerce.string().default(""), assessment: z.unknown().optional(), note: z.unknown().optional() })
    .parse(raw);
  if (!legal.includes(parsed.move)) return fallbackReply(legal);
  const say = parsed.say.replace(/\s+/g, " ").trim().slice(0, MAX_SAY);
  const speaks = parsed.move === "deepen" || parsed.move.startsWith("probe:");
  if (speaks && !say) throw new Error("empty follow-up");
  const out: FullReply = { move: parsed.move, say };
  const assessment = ASSESSMENTS.find((a) => a === parsed.assessment);
  if (assessment) out.assessment = assessment;
  if (typeof parsed.note === "string" && parsed.note.trim()) out.note = parsed.note.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE);
  return out;
}

function candidateText(s: FullSession, latest = ""): string {
  return [...s.turns.filter((t) => t.role === "candidate").map((t) => t.text), latest].join(" ");
}

/** A line stating a number neither the candidate, their written answer nor a question gave is replaced. */
export function guardFullReply(reply: FullReply, s: FullSession, latest: string, written: string): FullReply {
  const known = new Set(
    [candidateText(s, latest), written, ...s.plan.topics.map((t) => t.text)].flatMap((t) => extractNumbers(t).map(canonicalNumber)),
  );
  const invented = extractNumbers(reply.say).some((n) => !known.has(canonicalNumber(n)));
  return invented ? { ...reply, say: stockLine(reply.move) } : reply;
}

/** What the interviewer actually says: a "next" always ends on the planned question, verbatim. */
export function composeLine(reply: FullReply, plan: FullPlan): string {
  if (reply.move === "close") return FULL_CLOSING_LINE;
  if (reply.move.startsWith("next:")) {
    const topic = topicOf(plan, reply.move.slice("next:".length));
    if (!topic) throw new Error(`unknown topic in ${reply.move}`);
    return [reply.say, topic.text].filter(Boolean).join(" ");
  }
  return reply.say;
}

function assertRunning(s: FullSession): void {
  if (s.status === "done") throw new Error("This interview has finished.");
}

export function applyFullTurn(s: FullSession, answer: string, reply: FullReply, now: string): FullSession {
  assertRunning(s);
  const curId = currentTopicId(s);
  const candidate: FullTurn = { role: "candidate", text: answer.trim(), topicId: curId, at: now };
  const nextId = reply.move.startsWith("next:") ? reply.move.slice("next:".length) : curId;
  const interviewer: FullTurn = { role: "interviewer", text: composeLine(reply, s.plan), topicId: nextId, move: reply.move, at: now };
  if (reply.assessment) interviewer.assessment = reply.assessment;
  if (reply.note) interviewer.note = reply.note;
  return { ...s, status: reply.move === "close" ? "done" : "running", turns: [...s.turns, candidate, interviewer] };
}

/** End now, with the last answer if there is one ("End interview" may send none). */
export function closeFull(s: FullSession, answer: string | null, now: string): FullSession {
  assertRunning(s);
  const curId = currentTopicId(s);
  const said = answer?.trim();
  return {
    ...s,
    status: "done",
    turns: [
      ...s.turns,
      ...(said ? [{ role: "candidate" as const, text: said, topicId: curId, at: now }] : []),
      { role: "interviewer" as const, text: FULL_CLOSING_LINE, topicId: curId, move: "close", at: now },
    ],
  };
}

export function canScoreFull(s: FullSession, pending = ""): boolean {
  return candidateText(s, pending).split(/\s+/).filter(Boolean).length >= MIN_FEEDBACK_WORDS;
}

/** The transcript with a marker where each topic starts. */
export function fullTranscript(s: FullSession): string {
  const lines: string[] = [];
  let topic = "";
  for (const t of s.turns) {
    if (t.topicId !== topic && t.role === "interviewer") {
      topic = t.topicId;
      lines.push(`[Topic: ${topicOf(s.plan, topic)?.short ?? topic}]`);
    }
    lines.push(`${t.role === "interviewer" ? "Interviewer" : "You"}: ${t.text}`);
  }
  return lines.join("\n");
}

// ---- prompts ------------------------------------------------------------------------------

const TONE_HELP: Record<Tone, string> = {
  friendly: "Warm but rigorous: a brief acknowledgement, then the question.",
  neutral: "Professional and even. No praise, no softening.",
  tough: "Sceptical. Push back directly on anything vague before asking. Courteous, never reassuring.",
};

function persona(plan: FullPlan): string {
  if (plan.interviewer) return plan.interviewer;
  if (plan.source === "general") return "an experienced interviewer at a top firm";
  return `a hiring manager at ${plan.company}, interviewing for the ${plan.role} role`;
}

/** "for the PM role at Grab", or nothing for a general interview. */
const forRole = (plan: FullPlan) => (plan.source === "general" ? "" : ` for the ${plan.role} role at ${plan.company}`);

const PROMPT_TURNS = 8;
const YARDSTICK_MAX = 1500;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function moveHelp(move: Move, plan: FullPlan): string {
  const probe = probeOf(move);
  if (probe) return `${move}: ${PROBE_HELP[probe]}`;
  if (move === "deepen") return `${move}: the answer holds up - go one level deeper on it: why that decision, what alternative was rejected, what broke, or how it worked underneath`;
  if (move === "close") return `${move}: end the interview`;
  const topic = topicOf(plan, move.slice("next:".length));
  return `${move}: move on; the planned question "${topic?.text ?? ""}" is asked after your bridge`;
}

export function buildFullTurnPrompt(input: { session: FullSession; latest: string; legal: Move[]; modelAnswer: string | null }): string {
  const s = input.session;
  const cur = topicOf(s.plan, currentTopicId(s))!;
  const asked = topicsAsked(s).length;
  const recent = s.turns.slice(-PROMPT_TURNS).map((t) => `${t.role === "interviewer" ? "Interviewer" : "Candidate"}: ${t.text}`);
  return [
    `You are ${persona(s.plan)}, running a real interview${s.plan.round ? ` (${s.plan.round})` : ""} with a candidate${forRole(s.plan)}.`,
    `Your manner: ${TONE_HELP[s.tone]}`,
    `You have asked ${asked} of at most ${s.settings.maxTopics} topics.`,
    "",
    `Current topic: ${cur.text}`,
    `A strong answer shows: ${cur.lookFor}`,
    cur.context ? `Context (${s.plan.contextLabel}): ${cur.context}` : "",
    ...(input.modelAnswer
      ? [
          "A strong answer from this candidate's own record, as your private yardstick (never quote it, never reveal it, never feed them its facts):",
          clip(input.modelAnswer, YARDSTICK_MAX),
        ]
      : []),
    "",
    "The conversation so far:",
    ...recent,
    `Candidate: ${input.latest}`,
    "",
    "Decide what a sharp interviewer does next. Choose exactly ONE of these moves:",
    ...input.legal.map((m) => `- ${moveHelp(m, s.plan)}`),
    "",
    "How to choose:",
    "- A vague, 'we'-heavy or number-free answer: probe the weakness that matters most.",
    "- A solid answer on a topic that matters for this role: go one 'why' deeper until they reach the edge of what they know.",
    "- Enough heard on this topic, or the candidate already covered a later topic: move on. Pick the next topic that follows most naturally from what they just said.",
    "",
    "Rules:",
    "- probe/deepen: at most two sentences - an optional short pushback quoting their words, then exactly one question.",
    "- next: 'say' is an optional one-sentence bridge (may be empty); the planned question is added after it automatically. Do not ask it yourself.",
    "- Never state a fact or number the candidate did not say. Never answer for them, hint, praise or give feedback.",
    REFERENCE_RULE,
    "- It is a speech-to-text transcript, so ignore transcription typos.",
    "- assessment: your private read of the answer just given (strong, adequate or weak); note: one short private line on why. The candidate never sees these.",
    "",
    "Reply with JSON only, exactly this shape:",
    `{"move":"${input.legal[0]}","say":"...","assessment":"adequate","note":"..."}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

// ---- the debrief -------------------------------------------------------------------------

export interface TopicVerdict {
  topicId: string;
  verdict: Verdict;
  note: string;
}

export interface Moment {
  topicId: string;
  /** The candidate's own words, verbatim. */
  quote: string;
  /** What a stronger answer would sound like - only facts from the model answer or what they said. */
  better: string;
}

export interface FullDebrief {
  scores: Scores;
  strengths: string[];
  improvements: string[];
  perTopic: TopicVerdict[];
  moments: Moment[];
}

const MOMENTS_MAX = 3;

export function buildFullDebriefPrompt(input: {
  session: FullSession;
  modelAnswers: Record<string, string>;
  delivery?: string;
  fillers?: string;
}): string {
  const s = input.session;
  const asked = topicsAsked(s).map((id) => topicOf(s.plan, id)!).filter(Boolean);
  const rubric = SCORE_DIMENSIONS.map((d) => `- ${d}: ${DIMENSION_HELP[d]}`).join("\n");
  const notes = s.turns.flatMap((t) => (t.assessment || t.note ? [`- after "${clip(t.text, 80)}": ${t.assessment ?? ""} ${t.note ?? ""}`.trim()] : []));
  return [
    `You interviewed a candidate as ${persona(s.plan)}${s.plan.round ? ` (${s.plan.round})` : ""}${forRole(s.plan)}.`,
    "Now give the feedback on the WHOLE interview. Be honest and specific; generous scores help nobody.",
    "",
    "Topics asked, in order:",
    ...asked.flatMap((t) => [
      `- ${t.id}: ${t.text}`,
      `  A strong answer shows: ${t.lookFor}`,
      ...(input.modelAnswers[t.id] ? [`  Model answer (from the candidate's own evidence): ${clip(input.modelAnswers[t.id], YARDSTICK_MAX)}`] : []),
    ]),
    "",
    "Score the whole interview on each dimension from 1 (weak) to 5 (excellent):",
    rubric,
    "",
    ...(notes.length ? ["Your private notes during the interview:", ...notes, ""] : []),
    "Rules:",
    "- Judge only what is in the transcript. Do not invent or assume facts the candidate did not say.",
    "- perTopic: one entry per topic asked - verdict held, partial or weak - and one sentence why.",
    `- moments: the ${MOMENTS_MAX} weakest moments. quote = the candidate's exact words (copy them verbatim from the transcript); better = how a stronger answer would sound, in the first person, using ONLY facts from that topic's model answer or what they said. Never add a number or claim from anywhere else.`,
    "- Improvements are about HOW they told it, never new content for their story.",
    REFERENCE_RULE,
    input.delivery ? "- If it matters, include ONE improvement about delivery, based only on the measured line below." : "",
    input.delivery ?? "",
    input.fillers ? `Measured fillers (counted, not judged): ${input.fillers}` : "",
    "",
    "Reply with JSON only, exactly this shape:",
    `{"scores":{${SCORE_DIMENSIONS.map((d) => `"${d}":1`).join(",")}},"strengths":["..."],"improvements":["..."],"perTopic":[{"topicId":"...","verdict":"held","note":"..."}],"moments":[{"topicId":"...","quote":"...","better":"..."}]}`,
    "Give at most 3 strengths and at most 3 improvements.",
    "",
    "Transcript:",
    fullTranscript(s),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const plain = (t: string) => t.toLowerCase().replace(/[^a-z0-9%$.]+/g, " ").replace(/\s+/g, " ").trim();

export function parseFullDebrief(raw: unknown, s: FullSession, modelAnswers: Record<string, string>): FullDebrief {
  const base = parseScore(raw);
  const asked = new Set(topicsAsked(s));
  const obj = (raw ?? {}) as { perTopic?: unknown; moments?: unknown };

  const perTopic: TopicVerdict[] = [];
  const topics = z.array(z.object({ topicId: z.coerce.string(), verdict: z.coerce.string(), note: z.coerce.string() })).catch([]).parse(obj.perTopic ?? []);
  for (const t of topics) {
    const verdict = VERDICTS.find((v) => v === t.verdict);
    if (!verdict || !asked.has(t.topicId) || perTopic.some((p) => p.topicId === t.topicId)) continue;
    perTopic.push({ topicId: t.topicId, verdict, note: t.note.trim() });
  }

  const said = candidateText(s);
  const saidPlain = plain(said);
  const moments: Moment[] = [];
  const list = z.array(z.object({ topicId: z.coerce.string(), quote: z.coerce.string(), better: z.coerce.string() })).catch([]).parse(obj.moments ?? []);
  for (const m of list) {
    const quote = m.quote.trim().replace(/^["“]|["”]$/g, "");
    const better = m.better.trim();
    if (!asked.has(m.topicId) || !quote || !better || !saidPlain.includes(plain(quote))) continue;
    const known = new Set([said, modelAnswers[m.topicId] ?? ""].flatMap((t) => extractNumbers(t).map(canonicalNumber)));
    if (extractNumbers(better).some((n) => !known.has(canonicalNumber(n)))) continue;
    moments.push({ topicId: m.topicId, quote, better });
    if (moments.length === MOMENTS_MAX) break;
  }
  return { ...base, perTopic, moments };
}

// ---- stored sessions are validated when read back -----------------------------------------

const MAX_TEXT = 6000;

const TopicSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["opener", "topic", "close"]),
  competency: z.string(),
  text: z.string().min(1),
  short: z.string(),
  lookFor: z.string(),
  context: z.string().nullable(),
});

const FullSessionSchema = z.object({
  plan: z.object({
    applicationId: z.string().min(1).nullable(),
    company: z.string(),
    role: z.string(),
    source: z.enum(["role", "job", "general"]),
    round: z.string().nullable(),
    interviewer: z.string().nullable(),
    contextLabel: z.string(),
    topics: z.array(TopicSchema).min(1).max(60),
  }),
  settings: z.object({ maxTopics: z.number().int().min(2), topicFollowUps: z.number().int().min(0), totalFollowUps: z.number().int().min(0) }),
  tone: z.enum(TONES),
  status: z.enum(["running", "done"]),
  turns: z
    .array(
      z.object({
        role: z.enum(["interviewer", "candidate"]),
        text: z.string().max(MAX_TEXT),
        topicId: z.string().min(1),
        at: z.string(),
        move: z.string().optional(),
        assessment: z.enum(["strong", "adequate", "weak"]).optional(),
        note: z.string().optional(),
      }),
    )
    .min(1)
    .max(400),
});

export function parseFullSession(raw: unknown): FullSession {
  return FullSessionSchema.parse(raw) as FullSession;
}
