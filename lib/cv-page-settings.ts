import type { AutoSelectLimits } from "./editorial/auto-select";
import type { PageSize } from "./editorial/page-fit";
import type { CvPageSettings } from "./services/tailor-cv";

/**
 * Page settings for CV fitting come from config (CV_PAGE_SIZE, CV_SCALE,
 * CV_OVERHEAD_LINES - see .env.example), never from in-code defaults. When any
 * is missing the result is undefined and tailoring skips the page fit rather
 * than guessing a page. A value that is present but unusable is an error.
 */
export function cvPageSettingsFromEnv(env: Record<string, string | undefined>): CvPageSettings | undefined {
  const { CV_PAGE_SIZE, CV_SCALE, CV_OVERHEAD_LINES } = env;
  if (!CV_PAGE_SIZE || !CV_SCALE || !CV_OVERHEAD_LINES) return undefined;

  if (CV_PAGE_SIZE !== "A4" && CV_PAGE_SIZE !== "Letter") {
    throw new Error(`CV_PAGE_SIZE must be A4 or Letter, got "${CV_PAGE_SIZE}"`);
  }
  const scale = Number(CV_SCALE);
  if (!(scale > 0) || !Number.isFinite(scale)) throw new Error(`CV_SCALE must be a number > 0, got "${CV_SCALE}"`);
  const overheadLines = Number(CV_OVERHEAD_LINES);
  if (!Number.isInteger(overheadLines) || overheadLines < 0) {
    throw new Error(`CV_OVERHEAD_LINES must be a whole number >= 0, got "${CV_OVERHEAD_LINES}"`);
  }
  return { pageSize: CV_PAGE_SIZE as PageSize, scale, overheadLines };
}

/**
 * Whole-pool selection limits (lib/editorial/auto-select.ts) from config: CV_MAX_BULLETS,
 * CV_MAX_PER_ROLE, CV_MIN_PER_ROLE, CV_MAX_ORG_SHARE, CV_COLLISION_OVERLAP (.env.example).
 * All or none: when any is missing the result is undefined and tailoring keeps the
 * master-based selection. A value present but unusable is an error.
 */
export function cvSelectionSettingsFromEnv(env: Record<string, string | undefined>): AutoSelectLimits | undefined {
  const keys = ["CV_MAX_BULLETS", "CV_MAX_PER_ROLE", "CV_MIN_PER_ROLE", "CV_MAX_ORG_SHARE", "CV_COLLISION_OVERLAP"] as const;
  if (keys.some((k) => !env[k])) return undefined;
  const whole = (k: (typeof keys)[number], min: number) => {
    const n = Number(env[k]);
    if (!Number.isInteger(n) || n < min) throw new Error(`${k} must be a whole number >= ${min}, got "${env[k]}"`);
    return n;
  };
  const fraction = (k: (typeof keys)[number]) => {
    const n = Number(env[k]);
    if (!(n > 0 && n <= 1)) throw new Error(`${k} must be a number in (0, 1], got "${env[k]}"`);
    return n;
  };
  const maxBullets = whole("CV_MAX_BULLETS", 1);
  const maxPerRole = whole("CV_MAX_PER_ROLE", 1);
  const minPerRole = whole("CV_MIN_PER_ROLE", 0);
  if (minPerRole > maxPerRole) throw new Error(`CV_MIN_PER_ROLE (${minPerRole}) cannot exceed CV_MAX_PER_ROLE (${maxPerRole})`);
  return { maxBullets, maxPerRole, minPerRole, maxOrgShare: fraction("CV_MAX_ORG_SHARE"), collisionOverlap: fraction("CV_COLLISION_OVERLAP") };
}
