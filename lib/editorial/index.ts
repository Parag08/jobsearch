/**
 * Editorial layer (DESIGN.md §2): turns the scorer's candidate set into a CV.
 * Pure functions only - no I/O, no framework imports.
 *
 *   composeSelection  pins / per-org cap / excludes, with a decision per bullet
 *   fitToPage         short variant before a cut; never drops a pin
 *   pageFit           lines used vs budget for a pageSize + scale
 *   collisionAudit    two bullets, one argument
 *   repeatedPhraseAudit  a phrase repeated across the page (detection only)
 *   applicationGaps   JD requirements the bank cannot evidence -> cover letter
 */
export {
  PAGE_METRICS,
  charsPerLine,
  estimateLines,
  lineBudget,
  pageFit,
  type PageFit,
  type PageFitInput,
  type PageFitOptions,
  type PageMetrics,
  type PageSize,
} from "./page-fit";
export {
  composeSelection,
  rankBullets,
  type ComposeSelectionInput,
  type DecisionKind,
  type EditorialBullet,
  type Pin,
  type ScoredCandidate,
  type Selection,
  type SelectionDecision,
} from "./select";
export {
  SHORT_VARIANT_LABEL,
  fitToPage,
  resolveText,
  type FitAction,
  type FitToPageOptions,
  type FittedSelection,
  type TextChoice,
} from "./fit";
export {
  collisionAudit,
  jaccard,
  repeatedPhraseAudit,
  significantWords,
  tokens,
  type AuditBullet,
  type Collision,
  type CollisionOptions,
  type RepeatedPhrase,
  type RepeatedPhraseOptions,
} from "./audits";
export {
  applicationGaps,
  type ApplicationGaps,
  type EvidencedRequirement,
  type Requirement,
  type RequirementKind,
} from "./gaps";
