import type { Bullet } from "../types";
import type { Story } from "./types";

/**
 * A metric as written in prose: optional currency, digits (with , and .), optional scale
 * suffix (k/M/bn/x, or the word), optional trailing % or +.
 * Guards: not glued to letters/digits on either side (v2, Q3, 1st, GPT-4o are identifiers).
 */
const NUMBER_RE =
  /(?<![\p{L}\p{N}.,])((?:US\$|S\$|A\$|C\$|HK\$|[$£€¥])?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?(?:million|billion|thousand|bn|mn|mm|k|m|b|x)|(?:k|m|b|x))?(?:%|\+)?)(?![\p{L}\p{N}])/giu;

const SCALE: Record<string, string> = {
  k: "K", thousand: "K",
  m: "M", mn: "M", mm: "M", million: "M",
  b: "B", bn: "B", billion: "B",
  x: "X",
};

/** True for a bare four-digit year (1900-2099) with no symbol - a date, not a metric. */
function isBareYear(raw: string): boolean {
  return /^(?:19|20)\d{2}$/.test(raw);
}

/** Every metric-shaped number in `text`, in order, as written. */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const raw = m[1].trim();
    if (isBareYear(raw)) continue;
    out.push(raw);
  }
  return out;
}

/**
 * Comparison form: currency, %, + and commas stripped; scale word/suffix normalised
 * to K/M/B/X. "$2.1M", "2.1 million" and "2.1m" all become "2.1M".
 */
export function canonicalNumber(raw: string): string {
  const m = /^(?:US\$|S\$|A\$|C\$|HK\$|[$£€¥])?(\d+(?:,\d{3})*(?:\.\d+)?)\s?([a-z]+)?[%+]?$/i.exec(raw.trim());
  if (!m) return raw.trim();
  const digits = m[1].replace(/,/g, "");
  const scale = m[2] ? (SCALE[m[2].toLowerCase()] ?? m[2].toUpperCase()) : "";
  return digits + scale;
}

export interface NumberConsistency {
  ok: boolean;
  /** Numbers on the CV bullet, as written. */
  bulletNumbers: string[];
  /** Numbers the story states (action + result + the user's own `numbers`), as written. */
  storyNumbers: string[];
  /** Bullet numbers with no canonical match in the story - what the user might misquote. */
  unmatched: string[];
}

/**
 * Guarantee the user never says "about 30%" against a CV that says 30% (DESIGN.md §3):
 * every number on the bullet must be stated somewhere in the story's Action or Result
 * (or in the metric strings the user gave). Situation/Task set the scene and do not count
 * as evidence for an outcome number. Pure regex, zero tokens.
 */
export function numberConsistency(story: Story, bullet: Bullet): NumberConsistency {
  const bulletNumbers = extractNumbers(bullet.text);
  const storyNumbers = [
    ...extractNumbers(story.action),
    ...extractNumbers(story.result),
    ...story.numbers.flatMap(extractNumbers),
  ];
  const evidenced = new Set(storyNumbers.map(canonicalNumber));
  const unmatched = bulletNumbers.filter((n) => !evidenced.has(canonicalNumber(n)));
  return { ok: unmatched.length === 0, bulletNumbers, storyNumbers, unmatched };
}
