import { norm } from "../types";
import { canonicalNumber, extractNumbers } from "../stories/consistency";

/**
 * The three honesty guards at intake (ONBOARDING.md §3.4). Onboarding is the one place
 * rule 3 has no `buildDiff` to lean on - the bank is being written - so these run on
 * every proposed bullet before it is stored.
 */

export type IntroducedKind = "number" | "name";

export interface Introduced {
  kind: IntroducedKind;
  value: string;
}

export interface ProvenanceResult {
  ok: boolean;
  /** Numbers and names in the proposed bullet the user never said. Numbers first, then names, in bullet order. */
  introduced: Introduced[];
}

const TRAILING_PUNCT = /[.,;:!?)"'\]]+$/u;
const LEADING_PUNCT = /^[("'\[]+/u;
const SENTENCE_END = /[.;:!?]$/u;

function letters(s: string): string {
  return s.replace(/[^\p{L}]/gu, "");
}

/**
 * A "name-like" token: an all-caps acronym (SQL, AWS), a token with an inner capital
 * (GitHub, PyTorch), or a capitalised word - the last only when not sentence-initial,
 * since "Drove ..." is capitalised by position, not because it names anything.
 */
function isNameLike(token: string, sentenceInitial: boolean): boolean {
  const l = letters(token);
  if (l.length < 2) return false;
  if (l === l.toUpperCase()) return true; // SQL, AWS, GPT-4o
  if (/^\p{Lu}/u.test(token) && /\p{Lu}/u.test(token.slice(1))) return true; // GitHub
  return !sentenceInitial && /^\p{Lu}/u.test(token); // Kubernetes
}

/**
 * Guard 1 - provenance. Restructuring the user's wording is fine; introducing a number,
 * a noun or a tool name they never said is not (rule 3: naming a tool is itself a claim).
 * Numbers match by canonical form ("$2.1M" vs "2.1 million"); names by case-insensitive
 * substring of the user's input.
 */
export function provenanceCheck(userInput: string, proposedBullet: string): ProvenanceResult {
  const input = norm(userInput);
  const inputNumbers = new Set(extractNumbers(userInput).map(canonicalNumber));

  const introduced: Introduced[] = [];
  const seen = new Set<string>();
  const add = (kind: IntroducedKind, value: string) => {
    const key = `${kind}:${kind === "number" ? canonicalNumber(value) : norm(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    introduced.push({ kind, value });
  };

  for (const n of extractNumbers(proposedBullet)) {
    if (!inputNumbers.has(canonicalNumber(n))) add("number", n);
  }

  const rawTokens = proposedBullet.split(/\s+/).filter(Boolean);
  rawTokens.forEach((raw, i) => {
    const token = raw.replace(LEADING_PUNCT, "").replace(TRAILING_PUNCT, "");
    if (!token) return;
    const sentenceInitial = i === 0 || SENTENCE_END.test(rawTokens[i - 1]);
    if (!isNameLike(token, sentenceInitial)) return;
    if (!input.includes(norm(token))) add("name", token);
  });

  return { ok: introduced.length === 0, introduced };
}

/** Guard 2 - mark the gap instead of filling it: true when the bullet carries no number. */
export function needsMetric(bulletText: string): boolean {
  return extractNumbers(bulletText).length === 0;
}

/** Strength ceiling for a bullet still needing a metric - below the default (3), so it ranks under evidenced ones. */
export const MAX_UNEVIDENCED_STRENGTH = 2;

/** Guard 2, continued - cap strength until the user supplies a number. */
export function capStrength(strength: number, needsMetricFlag: boolean): number {
  return needsMetricFlag ? Math.min(strength, MAX_UNEVIDENCED_STRENGTH) : strength;
}
