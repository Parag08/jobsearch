import { canonicalNumber, extractNumbers } from "../stories/consistency";
import type { ProbeKind } from "./mock";

/**
 * Keeps the interviewer grounded in what the candidate actually said in THIS interview.
 *
 * A follow-up may only pick up the candidate's own words. Rules only, zero tokens:
 * - every number (digits, or written as words: "two", "a thousand", "ten petabytes") must
 *   appear in the candidate's answers or in a question that was asked;
 * - every proper noun (a capitalised word that does not start a sentence) must too;
 * - every quoted span must be the candidate's words, verbatim;
 * - a "you said / you mentioned ..." clause may only use content words the candidate used.
 * The model answer and the written notes are never in scope: the candidate did not say them.
 */

export interface Grounds {
  /** Everything the candidate has said so far, the latest answer included. */
  said: string[];
  /** The questions asked (and the company / role names), which the interviewer may echo. */
  questions: string[];
}

// ---- numbers ------------------------------------------------------------------------------

const UNITS: Record<string, number> = {
  zero: 0, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, dozen: 12,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9 };
const SUFFIX: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9 };

/** The value of a digit-written number ("$2.1M" -> 2100000, "40%" -> 40). */
function digitValue(raw: string): number | null {
  const c = canonicalNumber(raw);
  const m = /^(\d+(?:\.\d+)?)([KMBX])?$/.exec(c);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] && m[2] !== "X" ? SUFFIX[m[2]] : 1);
  return Math.round(n * 1000) / 1000;
}

/**
 * Number words in order, as values. "one" and "a" count only in front of a scale word
 * ("one hundred", "a thousand", "a dozen") - alone they are ordinary words.
 */
function wordValues(text: string): number[] {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const out: number[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const next = words[i + 1];
    const startsNumber =
      w in UNITS || w in TENS || ((w === "one" || w === "a" || w === "an") && next !== undefined && (next in SCALES || next === "dozen"));
    if (!startsNumber) {
      i++;
      continue;
    }
    let total = 0;
    let group = 0;
    let used = false;
    while (i < words.length) {
      const t = words[i];
      if (t === "one" || t === "a" || t === "an") {
        if (used || !(words[i + 1] in SCALES || words[i + 1] === "dozen")) break;
        group += 1;
      } else if (t === "dozen") group = (group || 1) * 12;
      else if (t in UNITS) group += UNITS[t];
      else if (t in TENS) group += TENS[t];
      else if (t in SCALES) {
        group = (group || 1) * SCALES[t];
        if (SCALES[t] >= 1000) {
          total += group;
          group = 0;
        }
      } else if (t === "and" && used && (words[i + 1] in UNITS || words[i + 1] in TENS)) {
        /* "a hundred and twenty" */
      } else break;
      used = true;
      i++;
    }
    out.push(total + group);
  }
  return out;
}

/** Every number in `text`, digits and words alike, as values (bare years are dates, not numbers). */
export function numberValues(text: string): number[] {
  const digits = extractNumbers(text)
    .map(digitValue)
    .filter((n): n is number => n !== null);
  return [...digits, ...wordValues(text.replace(/\d[\d,.]*/g, " "))];
}

// ---- words ----------------------------------------------------------------------------------

const plain = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

const STOP = new Set(
  (
    "a an the you your yours i me my we our us it its that this those these was were is are be been being had has have did do does done " +
    "to of in on at for by with and or but so then there their they them he she his her about as from into over up out not no very really " +
    "just also some any all when what why how which who whom would could should will can may might more most much many lot lots thing things " +
    "said say saying says mentioned mention told tell described describe talked talk noted note explained explain claimed claim keep kept " +
    "earlier before now again still only even get got went go going"
  ).split(" "),
);

/** A crude stem, enough to match "owned"/"owning"/"owns" and "plans"/"plan". */
function stem(w: string): string {
  for (const suf of ["ing", "ed", "es", "s"]) if (w.length > suf.length + 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
  return w;
}

const contentWords = (text: string) => plain(text).split(" ").filter((w) => w && !STOP.has(w) && !/^\d/.test(w));

/** Capitalised words that do not start a sentence: names of things, people, firms and tools. */
function properNouns(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.?!:;])\s+|["“”]\s*/)) {
    const words = sentence.trim().split(/\s+/);
    words.forEach((w, i) => {
      const bare = w.replace(/^[^\p{L}]+|[^\p{L}\p{N}]+$/gu, "");
      if (i === 0 || !bare || bare === "I" || bare.startsWith("I'")) return;
      if (/^\p{Lu}/u.test(bare)) out.push(bare);
    });
  }
  return out;
}

/** Spans in double or single quotes (an apostrophe inside a word is not a quote). */
function quotedSpans(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/["“]([^"”]+)["”]/g)) out.push(m[1]);
  for (const m of text.matchAll(/(?<![\p{L}])'([^']+)'(?![\p{L}])/gu)) out.push(m[1]);
  return out;
}

const CLAIM_RE =
  /\b(?:you(?:'ve)?\s+(?:said|mentioned|told me|described|talked about|noted|explained|claimed|keep saying|kept saying)|earlier you said|you were saying)\s+(?:that\s+)?([^.?!;—]+)/gi;

/** What is wrong with a follow-up, in plain words; empty when it only uses what was said. */
export function groundingProblems(line: string, grounds: Grounds): string[] {
  const saidText = grounds.said.join(" ");
  const allowedText = [saidText, ...grounds.questions].join(" ");
  const problems: string[] = [];

  const knownNumbers = new Set(numberValues(allowedText));
  for (const n of numberValues(line)) if (!knownNumbers.has(n)) problems.push(`number ${n}`);

  const allowedPlain = ` ${plain(allowedText)} `;
  for (const noun of properNouns(line)) if (!allowedPlain.includes(` ${plain(noun)} `)) problems.push(`name ${noun}`);

  const saidPlain = ` ${plain(saidText)} `;
  for (const q of quotedSpans(line)) if (!saidPlain.includes(` ${plain(q)} `)) problems.push(`quote "${q}"`);

  const saidStems = new Set(contentWords(saidText).map(stem));
  for (const m of line.matchAll(CLAIM_RE)) {
    const missing = contentWords(m[1].replace(/["“”']/g, " ")).filter((w) => !saidStems.has(stem(w)));
    if (missing.length) problems.push(`claim "${m[1].trim()}" (${missing.join(", ")})`);
  }
  return problems;
}

// ---- short and safe -------------------------------------------------------------------------

/** A follow-up is one short question, as a real interviewer asks it. */
export const MAX_FOLLOW_UP_WORDS = 25;

const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

const PRAISE_RE = /\b(thanks|thank you|great|interesting|helpful|good|nice|appreciate|makes sense|got it|okay|ok)\b/i;

/**
 * One short question, no preamble: leading sentences of praise or thanks are dropped, and a line
 * still over `maxWords` keeps only its last question if that one is short enough; else "".
 */
export function shortenFollowUp(line: string, maxWords: number): string {
  let sentences = line.replace(/\s+/g, " ").trim().split(/(?<=[.?!])\s+/).filter(Boolean);
  while (sentences.length > 1 && !sentences[0].endsWith("?") && PRAISE_RE.test(sentences[0])) sentences = sentences.slice(1);
  const t = sentences.join(" ");
  if (wordCount(t) <= maxWords) return t;
  const lastQuestion = [...sentences].reverse().find((s) => s.endsWith("?"));
  return lastQuestion && wordCount(lastQuestion) <= maxWords ? lastQuestion : "";
}

const DECISION_RE =
  /\b(chose|choose|decided|decide|picked|pick|went with|used|use|built|build|moved|move|switched|switch|owned|own|led|lead|designed|design|rewrote|rewrite|cut|dropped|drop|bet|traded|prioriti[sz]ed)\b/i;
const QUOTE_WORDS = 10;
const MIN_SENTENCE_WORDS = 4;

const ECHO_ASK: Record<ProbeKind | "deepen", string> = {
  deepen: "Why that, and what else did you consider?",
  depth: "Why that, and what else did you consider?",
  ownership: "What did you personally do there?",
  result: "How do you know it worked?",
  specificity: "Walk me through exactly what you did.",
  reflection: "What would you do differently now?",
  numbers: "How was that measured?",
};

/**
 * Code's own follow-up when the model's line is guarded out: a few of the candidate's own
 * words from their last answer (a decision, if there is one), then a short question.
 */
export function echoProbe(latest: string, move: ProbeKind | "deepen"): string | null {
  const sentences = latest
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.replace(/[.?!,;:]+$/g, "").trim())
    .filter((s) => wordCount(s) >= MIN_SENTENCE_WORDS);
  if (!sentences.length) return null;
  const pick = [...sentences].reverse().find((s) => DECISION_RE.test(s)) ?? sentences[sentences.length - 1];
  const words = pick.split(/\s+/);
  let hit = -1;
  words.forEach((w, i) => {
    if (DECISION_RE.test(w.replace(/[^\p{L}]/gu, ""))) hit = i;
  });
  const from = hit > 0 ? hit - 1 : hit === 0 ? 0 : Math.max(0, words.length - QUOTE_WORDS);
  let quote = words.slice(from, from + QUOTE_WORDS);
  while (quote.length > MIN_SENTENCE_WORDS && STOP.has(plain(quote[quote.length - 1]))) quote = quote.slice(0, -1);
  const q = quote.join(" ").replace(/^[,;:]+|[,;:]+$/g, "").replace(/["“”]/g, "");
  if (wordCount(q) < MIN_SENTENCE_WORDS - 1) return null;
  return `You said "${q}". ${ECHO_ASK[move]}`;
}

// ---- the same point twice -------------------------------------------------------------------

/** Words every follow-up uses; they say nothing about which point is being pressed. */
const QUESTION_WORDS = new Set(
  "why how what which exactly again choose chose chosen pick picked decide decided reason reasons approach alternative alternatives consider considered rule ruled instead rather personally specific specifically".split(" "),
);
const MIN_SHARED_WORDS = 2;
const SAME_POINT_SHARE = 0.6;

/**
 * True when two follow-ups press the same point: they share a number ("why 10%?" then "why
 * exactly 10%?"), or most of the smaller one's content words. A real interviewer who has had an
 * answer to a point moves on; asking it again in other words is the loop Parag hit on 21 Nov.
 */
export function samePoint(a: string, b: string): boolean {
  const numsA = new Set(numberValues(a));
  if (numberValues(b).some((n) => numsA.has(n))) return true;
  const words = (t: string) => new Set(contentWords(t).filter((w) => !QUESTION_WORDS.has(w)).map(stem));
  const wa = words(a);
  const wb = words(b);
  const shared = [...wa].filter((w) => wb.has(w)).length;
  const smaller = Math.min(wa.size, wb.size);
  return shared >= MIN_SHARED_WORDS && smaller > 0 && shared / smaller >= SAME_POINT_SHARE;
}
