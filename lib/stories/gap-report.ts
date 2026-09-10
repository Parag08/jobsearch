import { norm, type JdExtract } from "../types";
import { inferCompetencies } from "./competencies";
import { DEFAULT_VOCAB, type Competency, type CompetencyVocab, type Story } from "./types";

export interface StoryGapReport {
  /** Demanded competencies at least one story covers. */
  covered: Competency[];
  /** Demanded competencies with no story - "you have no story for failure, conflict, ..." */
  missing: Competency[];
  /** Every demanded competency -> the ids of stories covering it (empty when missing). */
  storiesByCompetency: Record<Competency, string[]>;
}

/**
 * JD extract -> likely competencies -> which stories cover them. Structurally the same as
 * gapAnalysis in lib/sector-graph.ts: demand on one side, evidence on the other.
 * Only competencies the JD demands appear; a story's other competencies are not a gap.
 */
export function storyGapReport(
  jd: JdExtract,
  stories: Story[],
  vocab: CompetencyVocab = DEFAULT_VOCAB,
): StoryGapReport {
  const demanded = inferCompetencies(jd, vocab);
  const storiesByCompetency: Record<Competency, string[]> = {};
  for (const c of demanded) {
    const key = norm(c);
    storiesByCompetency[c] = stories
      .filter((s) => s.competencies.some((sc) => norm(sc) === key))
      .map((s) => s.id);
  }
  return {
    covered: demanded.filter((c) => storiesByCompetency[c].length > 0),
    missing: demanded.filter((c) => storiesByCompetency[c].length === 0),
    storiesByCompetency,
  };
}
