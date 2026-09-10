import { norm, type JdExtract } from "../types";
import { DEFAULT_VOCAB, type Competency, type CompetencyVocab } from "./types";

/** Lexical form used on both sides of a match: norm() plus -, _, / flattened to spaces. */
function lex(s: string): string {
  return norm(s).replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-phrase, whole-word containment: "led" matches "led a team", not "misled". */
function containsPhrase(text: string, phrase: string): boolean {
  const p = lex(phrase);
  if (!p) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(p)}(?![\\p{L}\\p{N}])`, "u").test(text);
}

export interface CompetencyHit {
  competency: Competency;
  /** The vocab phrases (as written in the vocab) that fired, in vocab order. */
  matched: string[];
}

/**
 * Which competencies a piece of text evidences, with the phrases that fired.
 * Zero-token, deterministic: output follows vocab key order. Empty hits are dropped.
 */
export function matchCompetencies(text: string, vocab: CompetencyVocab = DEFAULT_VOCAB): CompetencyHit[] {
  const t = lex(text);
  const hits: CompetencyHit[] = [];
  for (const competency of Object.keys(vocab)) {
    const matched = vocab[competency].filter((phrase) => containsPhrase(t, phrase));
    if (matched.length > 0) hits.push({ competency, matched });
  }
  return hits;
}

/** The text of a JD extract that carries competency signal: skills, keywords, seniority, role title. */
export function jdCompetencyText(jd: JdExtract): string {
  return [...jd.skills, ...jd.keywords, jd.seniority ?? "", jd.role].join(" \n ");
}

/**
 * JD extract -> likely behavioural competencies, via the lexical table (token rule #2).
 * Returns competencies in vocab order, each at most once.
 */
export function inferCompetencies(jd: JdExtract, vocab: CompetencyVocab = DEFAULT_VOCAB): Competency[] {
  return matchCompetencies(jdCompetencyText(jd), vocab).map((h) => h.competency);
}
