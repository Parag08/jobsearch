import { z } from "zod";
import type { CaseQuestion, CaseSheet } from "./case-sheet";
import { BARS, OPENING, STEERING } from "./case-method";

/**
 * A live case interview, as a pure state machine.
 *
 * The code, not the model, owns the path: which question is current, when the next one is
 * asked, when an exhibit goes on the table, and whether a math answer is right. The model
 * only does what needs judgement - answering a clarifying question from the sheet, nudging,
 * deciding the bar has been met - and it answers in JSON the code applies. So the case
 * cannot drift off-script, leak an answer through arithmetic, or invent data (token rule:
 * rules before LLM calls; the prompt carries only the current question's slice).
 */

export type TurnRole = "interviewer" | "candidate" | "exhibit";

export interface Turn {
  role: TurnRole;
  text: string;
  questionId?: string;
  at: string;
}

export interface MathCheck {
  questionId: string;
  expected: number;
  heard: number | null;
  correct: boolean;
}

export interface CaseSession {
  caseId: string;
  index: number;
  status: "running" | "done";
  turns: Turn[];
  mathChecks: MathCheck[];
}

export function startSession(sheet: CaseSheet, now: string): CaseSession {
  return {
    caseId: sheet.id,
    index: 0,
    status: "running",
    turns: [{ role: "interviewer", text: sheet.prompt, questionId: sheet.questions[0].id, at: now }],
    mathChecks: [],
  };
}

export function currentQuestion(sheet: CaseSheet, s: CaseSession): CaseQuestion | undefined {
  return sheet.questions[s.index];
}

/** How a question is put to the candidate: the ask, plus whatever is shared up front. */
function questionText(q: CaseQuestion): string {
  return [q.ask, ...(q.given ?? [])].join("\n");
}

/** Move to the next question (or finish after the last). Returns a new session. */
export function advance(sheet: CaseSheet, s: CaseSession, now: string): CaseSession {
  if (s.index >= sheet.questions.length - 1) return { ...s, status: "done" };
  const index = s.index + 1;
  const q = sheet.questions[index];
  const turns: Turn[] = [...s.turns, { role: "interviewer", text: questionText(q), questionId: q.id, at: now }];
  if (q.exhibit) turns.push({ role: "exhibit", text: q.exhibit.title, questionId: q.id, at: now });
  return { ...s, index, turns };
}

// ---- numbers ------------------------------------------------------------------------------

export interface HeardNumber {
  value: number;
  /** "%" or "x" when the figure was a percentage or a multiple; "" otherwise. */
  unit: "" | "%" | "x";
  /** True when a scale word or suffix (k, m, bn, million...) fixed its size. */
  scaled: boolean;
}

const SCALE: Record<string, number> = {
  k: 1e3, thousand: 1e3,
  m: 1e6, mn: 1e6, mm: 1e6, million: 1e6, mil: 1e6,
  b: 1e9, bn: 1e9, billion: 1e9,
};

const NUMBER = /(\d[\d,]*(?:\.\d+)?|\.\d+)\s*(%|percent\b|x\b|times\b|thousand\b|million\b|mil\b|billion\b|bn\b|mn\b|mm\b|k\b|m\b|b\b)?/gi;

/** Every figure in a spoken or typed answer, with its scale applied. */
export function parseNumbers(text: string): HeardNumber[] {
  const out: HeardNumber[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const suffix = (m[2] ?? "").toLowerCase();
    if (suffix === "%" || suffix === "percent") out.push({ value: n, unit: "%", scaled: false });
    else if (suffix === "x" || suffix === "times") out.push({ value: n, unit: "x", scaled: false });
    else if (suffix in SCALE) out.push({ value: n * SCALE[suffix], unit: "", scaled: true });
    else out.push({ value: n, unit: "", scaled: false });
  }
  return out;
}

/**
 * Did the candidate land the answer? Deterministic, so the model never has to do sums.
 * A bare number may carry an implied scale ("360" for US$360m), so it is tried at each
 * scale; a percentage is never rescaled into an amount.
 */
export function checkMath(
  answer: { value: number; tolerance: number },
  text: string,
): { heard: number | null; correct: boolean } {
  const target = answer.value;
  const within = (v: number) => Math.abs(v - target) <= Math.abs(target) * answer.tolerance;
  let best: number | null = null;
  for (const n of parseNumbers(text)) {
    const options =
      n.unit === "%" ? (Math.abs(target) < 1000 ? [n.value] : []) :
      n.scaled || n.unit === "x" ? [n.value] :
      [n.value, n.value * 1e3, n.value * 1e6, n.value * 1e9];
    for (const v of options) {
      if (within(v)) return { heard: v, correct: true };
      // Remember the closest candidate at a plausible scale, for feedback.
      if (best === null || Math.abs(Math.log(Math.abs(v) + 1) - Math.log(Math.abs(target) + 1)) < Math.abs(Math.log(Math.abs(best) + 1) - Math.log(Math.abs(target) + 1))) {
        best = v;
      }
    }
  }
  return { heard: best, correct: false };
}

// ---- turns --------------------------------------------------------------------------------

export interface TurnReply {
  say: string;
  advance: boolean;
}

const TurnReplySchema = z.object({
  say: z.string().transform((s) => s.trim()).pipe(z.string().min(1)),
  advance: z.boolean().optional(),
  /** The prompt asks for 'done' - models mark 'the candidate has answered' more readily than 'move on'. */
  done: z.boolean().optional(),
});

export function parseTurnReply(raw: unknown): TurnReply {
  const r = TurnReplySchema.parse(raw);
  return { say: r.say, advance: Boolean(r.done ?? r.advance ?? false) };
}

// ---- guarding the interviewer's line ------------------------------------------------------

/** Neutral nudges used when a model line has to be replaced. Two per kind, so they do not repeat. */
const FALLBACK: Record<CaseQuestion["kind"], [string, string]> = {
  structure: ["How would you structure your approach?", "What would you want to look at first, and why?"],
  brainstorm: ["What other ideas come to mind?", "Can you group those, and is anything missing?"],
  math: ["Walk me through how you would set that up - which numbers do you need?", "Take it step by step - what is your final figure?"],
  chart: ["Take another look at the exhibit - what stands out, and why does it matter?", "What does that mean for the client?"],
  recommendation: ["What is your recommendation?", "What would you tell the CEO in one minute?"],
};

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean));
function similar(a: string, b: string): boolean {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both) >= 0.8;
}

/** Every figure the interviewer is entitled to say: the case so far, and anything said in the room. */
function allowedFigures(sheet: CaseSheet, s: CaseSession, candidateText: string): HeardNumber[] {
  const seen = sheet.questions.slice(0, s.index + 1);
  const text = [
    sheet.prompt,
    ...sheet.facts.map((f) => f.text),
    ...seen.flatMap((q) => [q.ask, ...(q.given ?? []), ...(q.onRequest ?? [])]),
    ...seen.flatMap((q) => (q.exhibit ? [q.exhibit.title, ...q.exhibit.columns, ...q.exhibit.rows.flat().map(String)] : [])),
    ...s.turns.map((t) => t.text),
    candidateText,
  ].join(" \n ");
  return parseNumbers(text);
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 0.005);

/**
 * Is this figure one the interviewer is entitled to say? Units must agree: a percentage only
 * matches a percentage, and an amount only an amount - both leaks were seen live ('50%' passing
 * as 'US$50 million'; a '$15 million' passing as a '15%' margin).
 */
function supported(n: HeardNumber, allowed: HeardNumber[]): boolean {
  if (n.unit === "%") return allowed.some((a) => a.unit === "%" && near(a.value, n.value));
  if (n.unit === "x") return allowed.some((a) => (a.unit === "x" || (a.unit === "" && !a.scaled)) && near(a.value, n.value));
  return allowed.some((a) => {
    if (a.unit !== "") return false;
    // A bare table figure may be quoted at any scale ("2,500" in a US$m table is "US$2.5bn").
    if (!a.scaled) return [1, 1e3, 1e6, 1e9].some((k) => near(a.value * k, n.value) || (!n.scaled && near(a.value, n.value)));
    // A scaled amount may be quoted as is, or without its unit ("US$20m" as "20").
    if (near(a.value, n.value)) return true;
    return !n.scaled && [1e3, 1e6, 1e9].some((k) => near(a.value / k, n.value));
  });
}

export interface GuardedReply extends TurnReply {
  /** Why the model's line was replaced, or null when it passed. */
  guarded: "unsupported-number" | "repeat" | null;
}

/**
 * Check the model's line before anyone hears it. The model is told not to invent data or do
 * sums, and still sometimes states a wrong total - which would teach the candidate a wrong
 * figure. So any number it says must already be in the case (as far as it has been shown)
 * or in the conversation; and it may not repeat a nudge it already gave on this question.
 * A failing line is replaced by a neutral nudge for this kind of question.
 */
export function guardReply(sheet: CaseSheet, s: CaseSession, candidateText: string, reply: TurnReply): GuardedReply {
  const q = currentQuestion(sheet, s);
  if (!q) return { ...reply, guarded: null };
  const said = s.turns.filter((t) => t.role === "interviewer" && t.questionId === q.id).map((t) => t.text);
  const fallback = (why: GuardedReply["guarded"]): GuardedReply => {
    const unused = FALLBACK[q.kind].find((f) => !said.some((x) => similar(x, f)));
    // Out of fresh nudges: stop circling and move the case on.
    return unused ? { say: unused, advance: reply.advance, guarded: why } : { say: "Let's move on.", advance: true, guarded: why };
  };

  const allowed = allowedFigures(sheet, s, candidateText);
  const invented = parseNumbers(reply.say).some((n) => {
    const smallCount = !n.scaled && n.unit === "" && Number.isInteger(n.value) && n.value <= 12;
    if (smallCount) return false;
    return !supported(n, allowed);
  });
  if (invented) return fallback("unsupported-number");
  if (!reply.advance && said.some((x) => similar(x, reply.say))) return fallback("repeat");
  return { ...reply, guarded: null };
}

/** Candidate turns allowed on a question before code moves on; the opening allows for clarifying questions. */
const TURN_CAP = { opening: 5, other: 3 };

/**
 * Should code close the current question, whatever the model says? Models are reluctant to
 * move a case on, so progress is guaranteed here: a correct math answer ends the math
 * question, and no question takes more than a few exchanges. Call BEFORE the model, with
 * the candidate's new line not yet applied.
 */
export function forcedAdvance(
  sheet: CaseSheet,
  s: CaseSession,
  mathCheck?: Pick<MathCheck, "correct"> & Partial<MathCheck>,
): "math-correct" | "turn-cap" | null {
  const q = currentQuestion(sheet, s);
  if (!q) return null;
  if (q.kind === "math" && mathCheck?.correct) return "math-correct";
  const turnsSoFar = s.turns.filter((t) => t.role === "candidate" && t.questionId === q.id).length;
  const cap = s.index === 0 ? TURN_CAP.opening : TURN_CAP.other;
  return turnsSoFar + 1 >= cap ? "turn-cap" : null;
}

/**
 * When a question closes, code asks the next one - so any question the model tacked on
 * would be asked twice. Keep only the sentences that are not questions.
 */
function acknowledgementOnly(say: string): string {
  const sentences = say.match(/[^.!?]+[.!?]*/g) ?? [say];
  const kept = sentences.map((x) => x.trim()).filter((x) => x && !x.endsWith("?"));
  return kept.length ? kept.join(" ") : "Thanks - let's move on.";
}

/** Record the candidate's line and the interviewer's reply; move on if the reply says so. */
export function applyTurn(
  sheet: CaseSheet,
  s: CaseSession,
  candidateText: string,
  reply: TurnReply,
  now: string,
  mathCheck?: MathCheck | { heard: number | null; correct: boolean; questionId?: string; expected?: number },
): CaseSession {
  const q = currentQuestion(sheet, s);
  let mathChecks = s.mathChecks;
  if (mathCheck && q?.kind === "math" && q.answer) {
    const prior = mathChecks.find((m) => m.questionId === q.id);
    // Once right, stays right: a later exploratory figure does not undo it.
    if (!prior?.correct) {
      const entry: MathCheck = { questionId: q.id, expected: q.answer.value, heard: mathCheck.heard, correct: mathCheck.correct };
      mathChecks = [...mathChecks.filter((m) => m.questionId !== q.id), entry];
    }
  }
  const next: CaseSession = {
    ...s,
    mathChecks,
    turns: [
      ...s.turns,
      { role: "candidate", text: candidateText, questionId: q?.id, at: now },
      { role: "interviewer", text: reply.advance ? acknowledgementOnly(reply.say) : reply.say, questionId: q?.id, at: now },
    ],
  };
  return reply.advance ? advance(sheet, next, now) : next;
}

// ---- prompts ------------------------------------------------------------------------------

const bullets = (xs: string[] | undefined) => (xs && xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- (none)");

function exhibitText(q: CaseQuestion): string {
  if (!q.exhibit) return "";
  const e = q.exhibit;
  return [`Exhibit on the table: ${e.title}`, e.columns.join(" | "), ...e.rows.map((r) => r.join(" | "))].join("\n");
}

/** The transcript of the current question only - earlier questions are settled. */
function recentTurns(s: CaseSession, questionId: string | undefined, limit = 12): string {
  return s.turns
    .filter((t) => t.questionId === questionId && t.role !== "exhibit")
    .slice(-limit)
    .map((t) => `${t.role}: ${t.text}`)
    .join("\n");
}

export function buildTurnPrompt(
  sheet: CaseSheet,
  s: CaseSession,
  candidateText: string,
  mathCheck?: MathCheck,
  /** True when code has already closed this question: the model only acknowledges. */
  closing = false,
): string {
  const q = currentQuestion(sheet, s)!;
  const bar = s.index === 0 ? [OPENING, BARS.structure] : [BARS[q.kind]];
  const isLast = s.index === sheet.questions.length - 1;
  const upcoming = sheet.questions[s.index + 1];

  const check = mathCheck
    ? mathCheck.correct
      ? "Arithmetic check (done by code, trust it): the candidate's figure is correct."
      : mathCheck.heard === null
        ? "Arithmetic check (done by code): the candidate has not stated a final figure yet."
        : "Arithmetic check (done by code, trust it): the candidate's figure does not match the answer. Tell them to re-check their numbers; do not say what the right figure is."
    : "";

  return [
    `You are a ${sheet.firm === "bain" ? "Bain" : sheet.firm.toUpperCase()} consultant giving a ${sheet.style} case interview. Stay in role. Speak naturally and briefly: at most three short sentences.`,
    "",
    "Rules:",
    "- Share only the facts and information listed below. If asked for anything not listed, say we don't have that and ask what they would assume.",
    "- Share an 'on request' item only when the candidate asks for it or clearly needs it.",
    "- Never give the answer, the structure, or the list of ideas. Never reveal the answer figure.",
    "- Do not do arithmetic yourself. Rely on the arithmetic check below.",
    "- Do not state comparisons or conclusions from the data - reading the data is the candidate's job. Ask what they see instead.",
    ...STEERING.map((x) => `- ${x}`),
    "- Never repeat a question or nudge you have already given. If they did not take it up, let it go.",
    isLast
      ? "- This is the final recommendation. When the candidate has given it, thank them and set done to true."
      : "- Set done to true when this question is done: the bar below is met, the candidate is stuck after one hint, or they have already moved on to the next question. The next question is then asked for you - do not ask it yourself.",
    "",
    `Case: ${sheet.title}`,
    `Prompt given to the candidate: ${sheet.prompt}`,
    "Facts you may share when asked:",
    bullets(sheet.facts.map((f) => f.text)),
    "",
    `Current question (${q.kind}): ${q.ask}`,
    q.given?.length ? `Already given with it:\n${bullets(q.given)}` : "",
    q.onRequest?.length ? `Share only on request:\n${bullets(q.onRequest)}` : "",
    exhibitText(q),
    q.keyPoints?.length ? `What a strong answer covers (for your judgement only):\n${bullets(q.keyPoints)}` : "",
    q.ideas?.length ? `Ideas a strong answer includes (for your judgement only):\n${bullets(q.ideas.map((i) => `${i.bucket}: ${i.items.join("; ")}`))}` : "",
    q.answer ? `Answer (never reveal): ${q.answer.display}. Working: ${q.answer.working.join(" / ")}` : "",
    upcoming
      ? `Next question in the case (${upcoming.kind}): "${upcoming.ask}". If the candidate is already answering this, they have moved on - set done to true.`
      : "",
    "",
    `The bar for this stage:\n${bullets(bar.flatMap((b) => b.steps))}`,
    check,
    "",
    "Conversation on this question so far:",
    recentTurns(s, q.id) || "(none yet)",
    `candidate: ${candidateText}`,
    "",
    closing
      ? 'This question is now finished. Acknowledge what the candidate said in one short, neutral sentence - do not say whether it was right. Do not ask anything - the next question is asked for you. Reply with JSON only: {"say": "your acknowledgement", "done": true}'
      : 'Reply with JSON only: {"say": "your next line to the candidate", "done": true or false}. "done" is true once the candidate has made a real attempt at the current question - it need not be perfect, the debrief grades quality. Ask at most one follow-up per question, and never about anything other than the current question.',
  ]
    .filter((line) => line !== "")
    .join("\n");
}

// ---- debrief ------------------------------------------------------------------------------

export const CASE_DIMENSIONS = ["structure", "analytics", "creativity", "judgement", "synthesis", "drive"] as const;
export type CaseDimension = (typeof CASE_DIMENSIONS)[number];
export type CaseScores = Record<CaseDimension, number>;

export const CASE_DIMENSION_HELP: Record<CaseDimension, string> = {
  structure: "A clear, specific, complete plan of attack - and prioritising within it",
  analytics: "Setting up and doing the math accurately, and reading exhibits correctly",
  creativity: "The number and range of ideas in brainstorms, organised into groups",
  judgement: "The 'so what' - business sense, sense-checks, spotting the twist",
  synthesis: "An answer-first recommendation with reasons, risks and next steps",
  drive: "Leading the case: asking for data, proposing next steps, moving it forward",
};

export interface CaseSignals {
  clarifyingQuestions: number;
  mathCorrect: number;
  mathTotal: number;
  questionsReached: number;
  minutes: number;
  candidateWords: number;
}

/** What can be measured without a model. */
export function caseSignals(sheet: CaseSheet, s: CaseSession): CaseSignals {
  const first = sheet.questions[0].id;
  const candidate = s.turns.filter((t) => t.role === "candidate");
  const start = Date.parse(s.turns[0]?.at ?? "");
  const end = Date.parse(s.turns[s.turns.length - 1]?.at ?? "");
  return {
    clarifyingQuestions: candidate.filter((t) => t.questionId === first).reduce((n, t) => n + (t.text.match(/\?/g)?.length ?? 0), 0),
    mathCorrect: s.mathChecks.filter((m) => m.correct).length,
    mathTotal: sheet.questions.filter((q) => q.kind === "math").length,
    // How far into the case they got: the current question counts once it has been asked.
    questionsReached: Math.min(sheet.questions.length, s.index + 1),
    minutes: Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 60_000) : 0,
    candidateWords: candidate.reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0),
  };
}

export function buildDebriefPrompt(sheet: CaseSheet, s: CaseSession, signals: CaseSignals): string {
  const questions = sheet.questions.map((q) =>
    [
      `[${q.id}] ${q.kind}: ${q.ask}`,
      `  Bar: ${BARS[q.kind].steps.join("; ")}`,
      q.keyPoints?.length ? `  Strong answers cover: ${q.keyPoints.join("; ")}` : "",
      q.ideas?.length ? `  Ideas: ${q.ideas.map((i) => `${i.bucket} (${i.items.length})`).join(", ")}` : "",
      q.answer ? `  Answer: ${q.answer.display}` : "",
      q.advanced?.length ? `  Outstanding answers add: ${q.advanced.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  const r = sheet.recommendation;
  return [
    `You are a ${sheet.firm === "bain" ? "Bain" : sheet.firm.toUpperCase()} interviewer writing feedback on a ${sheet.style} case interview you just gave.`,
    "Judge only what is in the transcript. Do not credit anything the candidate did not say. Be candid and specific; quote the candidate where it helps.",
    "",
    `Case: ${sheet.title}`,
    ...questions,
    `Model recommendation: ${r.answer} Reasons: ${r.reasoning.join("; ")}. Risks: ${r.risks.join("; ")}. Next steps: ${r.next.join("; ")}.`,
    "",
    `Measured by code (trust these): ${signals.clarifyingQuestions} clarifying questions; math right ${signals.mathCorrect} of ${signals.mathTotal}; reached ${signals.questionsReached} of ${sheet.questions.length} questions in ${signals.minutes} minutes.`,
    "",
    "Transcript:",
    s.turns.filter((t) => t.role !== "exhibit").map((t) => `${t.role}: ${t.text}`).join("\n"),
    "",
    `Score each dimension from 1 (weak) to 5 (would pass a Bain final round): ${CASE_DIMENSIONS.map((d) => `${d} = ${CASE_DIMENSION_HELP[d]}`).join("; ")}.`,
    "Reply with JSON only:",
    `{"scores": {${CASE_DIMENSIONS.map((d) => `"${d}": 1-5`).join(", ")}}, "strengths": ["up to 4"], "improvements": ["up to 4, each something to do differently next time"], "perQuestion": [{"questionId": "id", "note": "one sentence"}]}`,
  ].join("\n");
}

const clamp = z.coerce.number().transform((n) => Math.min(5, Math.max(1, Math.round(n))));
const DebriefSchema = z.object({
  scores: z.object(Object.fromEntries(CASE_DIMENSIONS.map((d) => [d, clamp])) as Record<CaseDimension, typeof clamp>),
  strengths: z.array(z.string()).transform((xs) => xs.slice(0, 4)),
  improvements: z.array(z.string()).transform((xs) => xs.slice(0, 4)),
  perQuestion: z.array(z.object({ questionId: z.string(), note: z.string() })).optional().default([]),
});
export type CaseDebrief = z.infer<typeof DebriefSchema>;

export function parseDebrief(raw: unknown): CaseDebrief {
  return DebriefSchema.parse(raw);
}

export function overallCaseScore(scores: CaseScores): number {
  const vals = CASE_DIMENSIONS.map((d) => scores[d]);
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}
