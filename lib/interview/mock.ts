import { z } from "zod";
import { canonicalNumber, extractNumbers } from "../stories/consistency";
import { DIMENSION_HELP, SCORE_DIMENSIONS, deliverySignals, numberDrift, parseScore, type Scores } from "./score";

/**
 * A behavioural mock interview with follow-ups (DESIGN.md section 3), as pure functions.
 *
 * The case room's split, applied to one behavioural question: CODE owns the path - which
 * weaknesses are worth probing, how many follow-ups there are, when the interview ends -
 * and the model only phrases the next probe, choosing from a list code hands it. Spotting
 * the gaps is rules, not tokens (token rule #2): "we" over "I", no measurable result, no
 * reflection, a number said aloud that the written answer does not contain. A follow-up
 * line that states a number nobody said is replaced, so the interviewer can never put
 * words in the candidate's mouth (honesty rule).
 */

export const PROBE_KINDS = ["numbers", "ownership", "result", "specificity", "reflection", "depth"] as const;
export type ProbeKind = (typeof PROBE_KINDS)[number];

export const TONES = ["friendly", "neutral", "tough"] as const;
export type Tone = (typeof TONES)[number];

export const MIN_FOLLOW_UPS = 1;
export const MAX_FOLLOW_UPS = 4;

/** What each probe is after - the model sees only the ones code offers. */
export const PROBE_HELP: Record<ProbeKind, string> = {
  numbers: "a number they just said does not match their written answer - ask which figure is right and how it was measured",
  ownership: "they say 'we' more than 'I' - ask what they personally did, and what would not have happened without them",
  result: "there is no measurable result yet - ask what changed, and push for a number",
  specificity: "the answer is high level - ask them to take you to one specific moment and what exactly they did",
  reflection: "no reflection yet - ask what they would do differently, or what they learned",
  depth: "test the judgement - ask why they chose that approach over the alternatives, or what the hardest part was",
};

/** Used when the model fails or a line is guarded out - always safe, never invents. */
export const FOLLOW_UP_FALLBACK: Record<ProbeKind, string> = {
  numbers: "That number doesn't match what you wrote down. Which figure is right, and how was it measured?",
  ownership: "You've said 'we' a lot. What did you personally do, and what wouldn't have happened without you?",
  result: "What was the result? Can you put a number on what changed?",
  specificity: "That's quite high level. Take me to one specific moment - what exactly did you do?",
  reflection: "Looking back, what would you do differently?",
  depth: "Why did you choose that approach over the alternatives?",
};

export const CLOSING_LINE = "Thank you - that's everything I need on this one.";

const TONE_HELP: Record<Tone, string> = {
  friendly: "Warm and encouraging, but still probe properly. A brief acknowledgement, then the question.",
  neutral: "Professional and even. No praise, no softening, straight to the question.",
  tough:
    "A sceptical partner. Push back directly on anything vague or unsupported before asking. Courteous, never reassuring.",
};

export interface MockTurn {
  role: "interviewer" | "candidate";
  text: string;
  /** On an interviewer follow-up: which weakness it probed. */
  probe?: ProbeKind;
  at: string;
}

export interface MockSession {
  questionId: string;
  tone: Tone;
  maxFollowUps: number;
  status: "running" | "done";
  turns: MockTurn[];
}

export interface FollowUp {
  probe: ProbeKind;
  say: string;
}

export function startMock(
  question: { id: string; text: string },
  opts: { tone: Tone; maxFollowUps: number },
  now: string,
): MockSession {
  const n = opts.maxFollowUps;
  if (!Number.isInteger(n) || n < MIN_FOLLOW_UPS || n > MAX_FOLLOW_UPS) {
    throw new Error(`follow-ups must be ${MIN_FOLLOW_UPS}-${MAX_FOLLOW_UPS}`);
  }
  return {
    questionId: question.id,
    tone: opts.tone,
    maxFollowUps: n,
    status: "running",
    turns: [{ role: "interviewer", text: question.text, at: now }],
  };
}

export function followUpsAsked(s: MockSession): number {
  return s.turns.filter((t) => t.role === "interviewer" && t.probe).length;
}

function probesAsked(s: MockSession): Set<ProbeKind> {
  return new Set(s.turns.flatMap((t) => (t.probe ? [t.probe] : [])));
}

function candidateSoFar(s: MockSession, latest: string): string {
  return [...s.turns.filter((t) => t.role === "candidate").map((t) => t.text), latest].join(" ");
}

const REFLECTION_RE = /\b(learn(?:ed|t)?|lesson|differently|in hindsight|looking back|would have|should have|next time|mistake)\b/i;
const SHORT_ANSWER_WORDS = 30;

/**
 * Weaknesses worth probing, most important first, excluding any already probed. Judged
 * on everything the candidate has said so far: a result given in the first answer still
 * counts after a follow-up. `depth` is the last resort, so there is always one probe
 * until every kind has been used.
 */
export function probeCandidates(s: MockSession, latest: string, writtenAnswer: string): ProbeKind[] {
  const all = candidateSoFar(s, latest);
  const signals = deliverySignals(all);
  const latestWords = latest.trim() ? latest.trim().split(/\s+/).length : 0;

  const gaps: ProbeKind[] = [];
  if (numberDrift(latest, writtenAnswer).saidNotWritten.length > 0) gaps.push("numbers");
  if (signals.ownershipRatio !== null && signals.ownershipRatio < 0.5) gaps.push("ownership");
  if (extractNumbers(all).length === 0) gaps.push("result");
  if (latestWords < SHORT_ANSWER_WORDS) gaps.push("specificity");
  if (!REFLECTION_RE.test(all)) gaps.push("reflection");
  gaps.push("depth");

  const asked = probesAsked(s);
  return gaps.filter((g) => !asked.has(g));
}

export type MockStep = { kind: "probe"; candidates: ProbeKind[] } | { kind: "close" };

/** Code decides: probe again, or close. The model is never asked whether to stop. */
export function nextStep(s: MockSession, latest: string, writtenAnswer: string): MockStep {
  if (followUpsAsked(s) >= s.maxFollowUps) return { kind: "close" };
  const candidates = probeCandidates(s, latest, writtenAnswer);
  return candidates.length ? { kind: "probe", candidates } : { kind: "close" };
}

/** The last few turns are enough context for a follow-up - the prompt stays small. */
const PROMPT_TURNS = 6;

export function buildFollowUpPrompt(input: {
  question: string;
  lookFor: string;
  firmNote: string | null;
  session: MockSession;
  latest: string;
  candidates: ProbeKind[];
}): string {
  const recent = input.session.turns.slice(-PROMPT_TURNS).map((t) => `${t.role === "interviewer" ? "Interviewer" : "Candidate"}: ${t.text}`);
  return [
    "You are interviewing a candidate for a top strategy consulting firm, on one behavioural question.",
    `Your manner: ${TONE_HELP[input.session.tone]}`,
    "",
    `Question: ${input.question}`,
    `A strong answer shows: ${input.lookFor}`,
    input.firmNote ? `Firm context: ${input.firmNote}` : "",
    "",
    "The conversation so far:",
    ...recent,
    `Candidate: ${input.latest}`,
    "",
    "Choose ONE of these weaknesses to probe next, the one that matters most for this answer:",
    ...input.candidates.map((c) => `- ${c}: ${PROBE_HELP[c]}`),
    "",
    "Rules:",
    "- Say at most two sentences: an optional short pushback naming what was missing, then exactly one question.",
    "- Never state a fact or number the candidate did not say. Quote their own words where it helps.",
    "- Never answer for them, suggest what they could have said, or give feedback yet - feedback comes at the end.",
    "- Stay on this question; do not move to a new topic.",
    "- It is a speech-to-text transcript, so ignore transcription typos.",
    "",
    "Reply with JSON only, exactly this shape:",
    `{"probe":"${input.candidates[0]}","say":"..."}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const MAX_SAY = 400;

export function parseFollowUp(raw: unknown, candidates: ProbeKind[]): FollowUp {
  const parsed = z.object({ probe: z.coerce.string(), say: z.coerce.string() }).parse(raw);
  const say = parsed.say.replace(/\s+/g, " ").trim().slice(0, MAX_SAY);
  if (!say) throw new Error("empty follow-up");
  const probe = candidates.find((c) => c === parsed.probe) ?? candidates[0];
  if (!probe) throw new Error("no probe to ask");
  return { probe, say };
}

/** A line stating a number neither the candidate nor their written answer gave is replaced. */
export function guardFollowUp(reply: FollowUp, s: MockSession, latest: string, writtenAnswer: string): FollowUp {
  const known = new Set(
    [candidateSoFar(s, latest), writtenAnswer, s.turns[0]?.text ?? ""].flatMap((t) => extractNumbers(t).map(canonicalNumber)),
  );
  const invented = extractNumbers(reply.say).some((n) => !known.has(canonicalNumber(n)));
  return invented ? { probe: reply.probe, say: FOLLOW_UP_FALLBACK[reply.probe] } : reply;
}

function assertRunning(s: MockSession): void {
  if (s.status === "done") throw new Error("This interview has finished.");
}

export function applyFollowUp(s: MockSession, answer: string, reply: FollowUp, now: string): MockSession {
  assertRunning(s);
  return {
    ...s,
    turns: [
      ...s.turns,
      { role: "candidate", text: answer.trim(), at: now },
      { role: "interviewer", text: reply.say, probe: reply.probe, at: now },
    ],
  };
}

/** End the interview, with the last answer if there is one ("finish now" sends none). */
export function closeMock(s: MockSession, answer: string | null, now: string): MockSession {
  assertRunning(s);
  const said = answer?.trim();
  return {
    ...s,
    status: "done",
    turns: [
      ...s.turns,
      ...(said ? [{ role: "candidate" as const, text: said, at: now }] : []),
      { role: "interviewer" as const, text: CLOSING_LINE, at: now },
    ],
  };
}

export function mockTranscript(s: MockSession): string {
  return s.turns.map((t) => `${t.role === "interviewer" ? "Interviewer" : "You"}: ${t.text}`).join("\n");
}

// ---- the debrief: judged by the model, validated here ------------------------------------

export const VERDICTS = ["held", "partial", "weak"] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface FollowUpVerdict {
  probe: ProbeKind;
  verdict: Verdict;
  note: string;
}

export interface MockDebrief {
  scores: Scores;
  strengths: string[];
  improvements: string[];
  followUps: FollowUpVerdict[];
}

export function buildMockDebriefPrompt(input: {
  question: string;
  lookFor: string;
  firmNote: string | null;
  session: MockSession;
}): string {
  const rubric = SCORE_DIMENSIONS.map((d) => `- ${d}: ${DIMENSION_HELP[d]}`).join("\n");
  const probes = input.session.turns.flatMap((t) => (t.probe ? [`- ${t.probe}: "${t.text}"`] : []));
  return [
    "You interviewed a candidate for a top strategy consulting firm on one behavioural question, with follow-ups.",
    "Now give the feedback. Be honest and specific; generous scores help nobody.",
    "",
    `Question: ${input.question}`,
    `A strong answer shows: ${input.lookFor}`,
    input.firmNote ? `Firm context: ${input.firmNote}` : "",
    "",
    "Score the WHOLE conversation on each dimension from 1 (weak) to 5 (excellent):",
    rubric,
    "",
    "For each follow-up you asked, say whether the candidate held up (held), partly (partial) or not (weak), in one sentence:",
    ...(probes.length ? probes : ["- (no follow-ups were asked)"]),
    "",
    "Rules:",
    "- Judge only what is in the transcript. Do not invent or assume facts the candidate did not say.",
    "- Improvements must be about HOW they told it (lead with the result, say what you personally did,",
    "  name the number) - never new content for their story.",
    "- Quote their own words where it helps. Ignore speech-to-text typos.",
    "",
    "Reply with JSON only, exactly this shape:",
    `{"scores":{${SCORE_DIMENSIONS.map((d) => `"${d}":1`).join(",")}},"strengths":["..."],"improvements":["..."],"followUps":[{"probe":"result","verdict":"held","note":"..."}]}`,
    "Give at most 3 strengths and at most 3 improvements.",
    "",
    "Transcript:",
    mockTranscript(input.session),
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const VerdictSchema = z.object({ probe: z.coerce.string(), verdict: z.coerce.string(), note: z.coerce.string() });

/** Scores validated as in parseScore (missing dimension throws); verdicts kept only for probes asked. */
export function parseMockDebrief(raw: unknown, s: MockSession): MockDebrief {
  const base = parseScore(raw);
  const asked = probesAsked(s);
  const list = z.array(VerdictSchema).catch([]).parse((raw as { followUps?: unknown } | null)?.followUps ?? []);
  const followUps: FollowUpVerdict[] = [];
  for (const v of list) {
    const probe = PROBE_KINDS.find((k) => k === v.probe);
    const verdict = VERDICTS.find((k) => k === v.verdict);
    if (!probe || !verdict || !asked.has(probe) || followUps.some((f) => f.probe === probe)) continue;
    followUps.push({ probe, verdict, note: v.note.trim() });
  }
  return { ...base, followUps };
}

// ---- the session crosses the wire, so it is validated on the way back in -----------------

const MAX_TURN_TEXT = 6000;
const MAX_TURNS = 2 * (MAX_FOLLOW_UPS + 1) + 2;

const MockSessionSchema = z.object({
  questionId: z.string().min(1),
  tone: z.enum(TONES),
  maxFollowUps: z.number().int().min(MIN_FOLLOW_UPS).max(MAX_FOLLOW_UPS),
  status: z.enum(["running", "done"]),
  turns: z
    .array(
      z.object({
        role: z.enum(["interviewer", "candidate"]),
        text: z.string().max(MAX_TURN_TEXT),
        probe: z.enum(PROBE_KINDS).optional(),
        at: z.string(),
      }),
    )
    .min(1)
    .max(MAX_TURNS),
});

export function parseMockSession(raw: unknown): MockSession {
  const s = MockSessionSchema.parse(raw);
  return {
    ...s,
    turns: s.turns.map((t) => (t.probe ? { role: t.role, text: t.text, probe: t.probe, at: t.at } : { role: t.role, text: t.text, at: t.at })),
  };
}
