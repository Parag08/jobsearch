import { z } from "zod";
import { canonicalNumber, extractNumbers } from "../stories/consistency";

/**
 * Scoring a spoken practice answer (DESIGN.md section 3).
 *
 * Split in two on purpose. What can be MEASURED is measured here, deterministically and
 * for free (token rule #2): length, pace, how much is "I" versus "we", and whether a
 * number said aloud matches the one in the written answer. Only what needs judgement -
 * structure, specificity, reflection - goes to the model, and its output is validated
 * and clamped rather than trusted.
 */

export const SCORE_DIMENSIONS = ["structure", "ownership", "specificity", "impact", "reflection", "relevance"] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];
export type Scores = Record<ScoreDimension, number>;

/** What each dimension means, so the model and the UI describe the same thing. */
export const DIMENSION_HELP: Record<ScoreDimension, string> = {
  structure: "Answer first, then a clear Situation, Task, Action, Result",
  ownership: "What YOU did, not what the team did",
  specificity: "Concrete detail and real numbers, not generalities",
  impact: "A clear, measurable result",
  reflection: "What you learned or would do differently",
  relevance: "Actually answers the question that was asked",
};

// ---- measured, not judged -------------------------------------------------------------

/** A spoken behavioural answer should run roughly 1.5 to 3 minutes. */
const MIN_SECONDS = 60;
const MAX_SECONDS = 210;
/** When there is no recording length, ~140 words a minute stands in for it. */
const MIN_WORDS = 120;
const MAX_WORDS = 500;

export interface DeliverySignals {
  words: number;
  durationSeconds: number | null;
  wordsPerMinute: number | null;
  pace: "too-short" | "good" | "too-long";
  iCount: number;
  weCount: number;
  /** I / (I + we). Null when neither is used - no ratio is better than an invented one. */
  ownershipRatio: number | null;
  numbers: string[];
}

function countWord(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

export function deliverySignals(transcript: string, durationSeconds?: number | null): DeliverySignals {
  const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const duration = durationSeconds && durationSeconds > 0 ? Math.round(durationSeconds) : null;

  let pace: DeliverySignals["pace"] = "good";
  if (duration !== null) {
    if (duration < MIN_SECONDS) pace = "too-short";
    else if (duration > MAX_SECONDS) pace = "too-long";
  } else if (words < MIN_WORDS) pace = "too-short";
  else if (words > MAX_WORDS) pace = "too-long";

  const iCount = countWord(transcript, /\b(i|me|my|mine)\b/gi);
  const weCount = countWord(transcript, /\b(we|us|our|ours)\b/gi);

  return {
    words,
    durationSeconds: duration,
    wordsPerMinute: duration ? Math.round(words / (duration / 60)) : null,
    pace,
    iCount,
    weCount,
    ownershipRatio: iCount + weCount > 0 ? Math.round((iCount / (iCount + weCount)) * 100) / 100 : null,
    numbers: extractNumbers(transcript),
  };
}

export interface NumberDrift {
  /** Said aloud but absent from the written answer: the "about 40%" versus 30% problem. */
  saidNotWritten: string[];
}

/**
 * A number you say in the room that does not match what you wrote is the fastest way to
 * lose an interviewer's trust. Compared in canonical form, so "30%" matches "30 percent".
 */
export function numberDrift(transcript: string, writtenAnswer: string): NumberDrift {
  if (!writtenAnswer.trim()) return { saidNotWritten: [] };
  const written = new Set(extractNumbers(writtenAnswer).map(canonicalNumber));
  const said = extractNumbers(transcript);
  return { saidNotWritten: [...new Set(said.filter((n) => !written.has(canonicalNumber(n))))] };
}

// ---- judged, by the model ---------------------------------------------------------------

export interface ScoringInput {
  question: string;
  lookFor: string;
  firmNote: string | null;
  transcript: string;
}

export function buildScoringPrompt(input: ScoringInput): string {
  const rubric = SCORE_DIMENSIONS.map((d) => `- ${d}: ${DIMENSION_HELP[d]}`).join("\n");
  return [
    "You are an experienced interviewer at a top strategy consulting firm, scoring a candidate's",
    "spoken answer to a behavioural question. Be honest and specific; generous scores help nobody.",
    "",
    `Question: ${input.question}`,
    `A strong answer shows: ${input.lookFor}`,
    input.firmNote ? `Firm context: ${input.firmNote}` : "",
    "",
    "Score each dimension from 1 (weak) to 5 (excellent):",
    rubric,
    "",
    "Rules:",
    "- Judge only what is in the transcript. Do not invent or assume facts the candidate did not say.",
    "- Do not rewrite their story or add detail to it. Improvements must be about HOW they told it",
    "  (lead with the result, say what you personally did, name the number) - never new content.",
    "- Quote their own words in your feedback where it helps.",
    "- It is a speech-to-text transcript, so ignore transcription typos.",
    "",
    "Reply with JSON only, exactly this shape:",
    `{"scores":{${SCORE_DIMENSIONS.map((d) => `"${d}":1`).join(",")}},"strengths":["..."],"improvements":["..."]}`,
    "Give at most 3 strengths and at most 3 improvements.",
    "",
    "Transcript:",
    input.transcript,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n)));
const scoreValue = z.coerce.number().transform(clamp);

const ModelScoreSchema = z.object({
  scores: z.object(Object.fromEntries(SCORE_DIMENSIONS.map((d) => [d, scoreValue])) as Record<ScoreDimension, typeof scoreValue>),
  strengths: z.array(z.coerce.string()).default([]),
  improvements: z.array(z.coerce.string()).default([]),
});

export interface ModelScore {
  scores: Scores;
  strengths: string[];
  improvements: string[];
}

/**
 * Validate what the model returned. Out-of-range scores are clamped; a missing dimension
 * throws, because a partial score reads as a complete one and misleads.
 */
export function parseScore(raw: unknown): ModelScore {
  const parsed = ModelScoreSchema.parse(raw);
  return {
    scores: parsed.scores as Scores,
    strengths: parsed.strengths.filter(Boolean).slice(0, 4),
    improvements: parsed.improvements.filter(Boolean).slice(0, 4),
  };
}

export function overallScore(scores: Scores): number {
  const values = SCORE_DIMENSIONS.map((d) => scores[d]);
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}
