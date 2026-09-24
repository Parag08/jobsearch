import type { QuestionKind } from "./case-sheet";

/**
 * How a case is run and judged - the method good casebooks teach, restated in our own
 * words. Generic (no personal facts), so it lives in code like DEFAULT_CASE_VOCAB.
 *
 * The interviewer prompt carries the bar for the current question only, and the page
 * shows the same bar as "what good looks like", so the candidate and the AI are held to
 * one standard.
 */

export interface Bar {
  label: string;
  /** What a strong answer does, in order. */
  steps: string[];
}

export const OPENING: Bar = {
  label: "Opening",
  steps: [
    "Play the prompt back in a sentence, to show you have the objective right",
    "Optionally add one or two quick observations about the industry",
    "Ask two or three clarifying questions - the objective, the business model, the geography",
    "Ask for a minute to structure your thinking",
  ],
};

export const BARS: Record<QuestionKind, Bar> = {
  structure: {
    label: "Structure",
    steps: [
      "Give a one-line overview first: 'I'd look at this through four lenses: ...'",
      "Cover the areas this kind of case needs - for a deal: market, target, fit and synergies, price and returns, risks",
      "Make it specific to this client, with one or two sharp observations rather than a generic framework",
      "End by saying where you would start, and why",
    ],
  },
  brainstorm: {
    label: "Brainstorm",
    steps: [
      "Take a moment, then give a one-line split into two to four groups",
      "Offer at least four ideas; seven or eight is what the strongest candidates give",
      "Keep the groups distinct, so they do not overlap and nothing big is missing",
      "Say why the one or two most important ideas matter here",
    ],
  },
  math: {
    label: "Math",
    steps: [
      "Lay out the approach before calculating",
      "Ask for any data you need rather than assuming it silently",
      "Calculate accurately, saying the steps aloud and rounding sensibly",
      "Say what the number means for the client - the 'so what' - and sense-check it",
    ],
  },
  chart: {
    label: "Chart",
    steps: [
      "Say what the exhibit shows: its title, units and what is being compared",
      "Pick out the one or two things that matter, with the numbers",
      "Draw the implication for the question we are answering",
      "Say what you would want to look at next",
    ],
  },
  recommendation: {
    label: "Recommendation",
    steps: [
      "Lead with the answer in one sentence",
      "Give two or three reasons, each with a number from the case",
      "Name two or three risks",
      "Close with two or three next steps - all in about a minute",
    ],
  },
};

/** Phrases a case-giver uses to keep a candidate-led case on track without leading it. */
export const STEERING = [
  "When the candidate asks a good question, answer it briefly and let them carry on.",
  "When they drift, bring them back: 'Good thought - before that, what about ...?'",
  "When they are stuck, give a small hint, never the answer.",
  "When they have met the bar for this question, or are stuck after two hints, move on.",
];
