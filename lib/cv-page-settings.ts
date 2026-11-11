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
