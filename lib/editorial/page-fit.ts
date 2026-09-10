/**
 * Page-fit model (DESIGN.md §2). A tailored CV is a laid-out page with
 * measurable overflow, not a list of strings - without a measured overflow the
 * "prefer a short variant over cutting a bullet" rule cannot be honoured.
 *
 * Deliberately a first-order estimate: average characters per line and lines
 * per page for a page size at a font scale. Good enough to drive editorial
 * trades; the renderer is the final word.
 */

export type PageSize = "A4" | "Letter";

export interface PageMetrics {
  /** Average characters that fit on one body line at scale 1. */
  charsPerLine: number;
  /** Body lines available on one page at scale 1. */
  lines: number;
}

/** Base metrics at scale 1 (~10pt body, ~2cm margins). Letter is wider and shorter than A4. */
export const PAGE_METRICS: Record<PageSize, PageMetrics> = {
  A4: { charsPerLine: 100, lines: 56 },
  Letter: { charsPerLine: 104, lines: 52 },
};

export interface PageFitOptions {
  pageSize: PageSize;
  /** Font scale, 1 = base. Smaller => more characters per line and more lines per page. */
  scale: number;
}

export interface PageFitInput {
  /** Resolved bullet texts, in page order. */
  bullets: string[];
  summaryLine: string;
  /** Lines taken by headings, contact block, skills/technologies lines, dates - everything not a bullet. */
  overheadLines: number;
}

export interface PageFit {
  linesUsed: number;
  lineBudget: number;
  /** Lines beyond the budget; 0 when the page fits. */
  overflow: number;
  /** Unused lines; 0 when the page overflows. */
  slack: number;
  /** Lines per bullet, same order as the input. */
  perBullet: number[];
}

function assertScale(scale: number): void {
  if (!(scale > 0) || !Number.isFinite(scale)) throw new Error(`page-fit: scale must be > 0, got ${scale}`);
}

export function charsPerLine(pageSize: PageSize, scale: number): number {
  assertScale(scale);
  return Math.round(PAGE_METRICS[pageSize].charsPerLine / scale);
}

export function lineBudget(pageSize: PageSize, scale: number): number {
  assertScale(scale);
  return Math.floor(PAGE_METRICS[pageSize].lines / scale);
}

/** Lines one text takes: ceil(chars / charsPerLine); empty text takes none. */
export function estimateLines(text: string, charsPerLineCount: number): number {
  const len = text.trim().length;
  if (len === 0) return 0;
  return Math.ceil(len / charsPerLineCount);
}

export function pageFit(input: PageFitInput, opts: PageFitOptions): PageFit {
  const cpl = charsPerLine(opts.pageSize, opts.scale);
  const budget = lineBudget(opts.pageSize, opts.scale);
  const perBullet = input.bullets.map((t) => estimateLines(t, cpl));
  const linesUsed =
    input.overheadLines + estimateLines(input.summaryLine, cpl) + perBullet.reduce((a, b) => a + b, 0);
  return {
    linesUsed,
    lineBudget: budget,
    overflow: Math.max(0, linesUsed - budget),
    slack: Math.max(0, budget - linesUsed),
    perBullet,
  };
}
