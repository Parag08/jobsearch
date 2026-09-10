/**
 * Onboarding domain logic (docs/ONBOARDING.md) - the parts that are pure:
 * skeleton merge, the three intake honesty guards, readiness, and the nudge queue.
 */
export {
  SkeletonSchema,
  SkeletonOrgSchema,
  SkeletonRoleSchema,
  mergeSkeletons,
  datesOverlap,
  overlapMonths,
  orgKey,
  titleSimilarity,
  type Skeleton,
  type SkeletonOrg,
  type SkeletonRole,
  type SkeletonMerge,
  type SkeletonDisagreement,
  type DisagreementField,
} from "./skeleton";
export {
  provenanceCheck,
  needsMetric,
  capStrength,
  MAX_UNEVIDENCED_STRENGTH,
  type ProvenanceResult,
  type Introduced,
  type IntroducedKind,
} from "./intake-guard";
export {
  readiness,
  proudestThree,
  TOP_STRENGTH,
  DEFAULT_STRENGTH,
  MAX_PROUDEST,
  MIN_RECENT_ROLES,
  POINTS_PER_ROLE,
  TARGET_POINTS,
  type Readiness,
  type ReadinessInput,
  type ReadinessRole,
} from "./readiness";
export { nudgeQueue, NUDGE_PRIORITY, type Nudge, type NudgeKind, type NudgeBank } from "./nudges";
