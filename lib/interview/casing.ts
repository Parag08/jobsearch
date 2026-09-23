import type { Bullet } from "../types";
import { lexical } from "./technical";

/**
 * Case-interview archetypes matched against what the candidate has actually done.
 *
 * The point is not to teach frameworks - books do that. It is to separate the case
 * types you have LIVED from the ones you have only read about, because an interviewer
 * who hears a real operating example in a cost case is hearing something a framework
 * cannot produce. Everything else is honest practice ground.
 */

/** case type -> phrases that, appearing in a bullet, evidence having done it. */
export type CaseVocab = Record<string, readonly string[]>;

/**
 * Shipped default. Data, not code (rule 4): a firm-specific archetype can be added
 * by passing a different vocabulary, without touching lib/.
 */
export const DEFAULT_CASE_VOCAB: CaseVocab = {
  "cost-reduction": ["cost", "operating cost", "efficiency", "savings", "reduce", "overhead"],
  profitability: ["revenue", "margin", "profit", "p&l", "acv", "recurring revenue"],
  "growth-strategy": ["growth", "expansion", "new revenue", "conversion", "adoption", "footfall"],
  "market-entry": ["market entry", "new market", "launch", "go-to-market", "gtm", "zero to mvp"],
  "operations-improvement": ["process", "workflow", "automation", "deployment", "throughput", "network", "routing", "operating model"],
  "due-diligence": ["due diligence", "diligence", "risk", "compliance", "licensing", "security"],
  pricing: ["pricing", "price", "unit economics", "average order value"],
  "org-and-people": ["team of", "developers", "engineers", "hiring", "mentored", "coached", "standards"],
};

export interface CaseTypeFit {
  caseType: string;
  /** True when at least one bullet evidences having done this kind of work. */
  lived: boolean;
  /** Ids of the bullets behind it. */
  evidence: string[];
}

function hits(bullets: Bullet[], phrases: readonly string[]): string[] {
  return bullets
    .filter((b) => {
      const hay = `${lexical(b.text)} ${b.skills.map(lexical).join(" ")}`;
      return phrases.some((p) => hay.includes(lexical(p)));
    })
    .map((b) => b.id);
}

/**
 * Every case type in the vocabulary, lived ones first - those are the examples to
 * reach for when an interviewer asks whether you have seen this before.
 */
export function caseTypeFits(bullets: Bullet[], vocab: CaseVocab = DEFAULT_CASE_VOCAB): CaseTypeFit[] {
  const fits = Object.entries(vocab).map(([caseType, phrases]) => {
    const evidence = hits(bullets, phrases);
    return { caseType, lived: evidence.length > 0, evidence };
  });
  // Lived first, then by weight of evidence; stable within each group.
  return fits.sort((a, b) => Number(b.lived) - Number(a.lived) || b.evidence.length - a.evidence.length);
}
