/**
 * STAR interview prep (DESIGN.md §3) - the eighth module.
 * Pure domain: stories are captured from the user, never generated.
 */
export {
  StorySchema,
  DEFAULT_VOCAB,
  DEFAULT_COMPETENCIES,
  type Story,
  type Competency,
  type CompetencyVocab,
} from "./types";
export { inferCompetencies, matchCompetencies, jdCompetencyText, type CompetencyHit } from "./competencies";
export { storyGapReport, type StoryGapReport } from "./gap-report";
export { numberConsistency, extractNumbers, canonicalNumber, type NumberConsistency } from "./consistency";
export { prepSet, type PrepSet, type PrepItem, type StoryMatch } from "./prep";
