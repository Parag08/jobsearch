import { pageFit, type PageFit, type PageFitOptions } from "./page-fit";
import { rankBullets, type EditorialBullet, type Selection } from "./select";

/**
 * Page fitting (CLAUDE.md rule 3, second selection rule): when the page runs
 * long, FIRST swap bullets to their short variant (lowest-scoring first), and
 * only if it still overflows drop the lowest-scoring unpinned bullet. A pinned
 * bullet is never dropped; an override (hand-written for this application) is
 * never replaced. Every action is recorded.
 */

/** Variant label the corpus uses for the compressed wording of a bullet. */
export const SHORT_VARIANT_LABEL = "short";

export interface TextChoice {
  /** Variant label to render, if any. */
  variant?: string;
  /** One-off wording for this application; wins over the variant. */
  override?: string;
}

/** Text that actually lands on the page for one bullet: override > variant > base. */
export function resolveText(bullet: EditorialBullet, choice: TextChoice = {}): string {
  if (choice.override !== undefined) return choice.override;
  if (choice.variant !== undefined) {
    const v = bullet.variants?.find((x) => x.label === choice.variant);
    if (v) return v.text;
  }
  return bullet.text;
}

export interface FitToPageOptions extends PageFitOptions {
  summaryLine: string;
  overheadLines: number;
  /** bulletId -> variant label already chosen (e.g. to mirror JD wording). */
  variants?: Record<string, string>;
  /** bulletId -> one-off wording for this application. */
  overrides?: Record<string, string>;
  /** Label of the short variant; defaults to "short". */
  shortLabel?: string;
}

export type FitAction =
  | { kind: "short-variant"; bulletId: string; from: string | null; linesSaved: number }
  | { kind: "drop"; bulletId: string; linesSaved: number };

export interface FittedSelection {
  bulletIds: string[];
  /** Variant choices after fitting (only for bullets still on the page). */
  variants: Record<string, string>;
  /** Overrides carried through (only for bullets still on the page). */
  overrides: Record<string, string>;
  actions: FitAction[];
  fit: PageFit;
}

export function fitToPage(
  selection: Selection,
  bank: Record<string, EditorialBullet>,
  opts: FitToPageOptions,
): FittedSelection {
  const shortLabel = opts.shortLabel ?? SHORT_VARIANT_LABEL;
  const pinned = new Set(selection.pinnedIds);
  const scoreOf = (id: string) => selection.decisions.find((d) => d.bulletId === id)?.score ?? 0;

  let ids = [...selection.bulletIds];
  const variants: Record<string, string> = { ...(opts.variants ?? {}) };
  const overrides: Record<string, string> = { ...(opts.overrides ?? {}) };
  const actions: FitAction[] = [];

  const measure = () =>
    pageFit(
      {
        bullets: ids.map((id) => resolveText(bank[id], { variant: variants[id], override: overrides[id] })),
        summaryLine: opts.summaryLine,
        overheadLines: opts.overheadLines,
      },
      opts,
    );

  let fit = measure();

  // Phase 1: short variants, lowest-scoring first. Worst-first = reverse of best-first.
  const canShorten = (id: string) =>
    overrides[id] === undefined &&
    variants[id] !== shortLabel &&
    bank[id].variants?.some((v) => v.label === shortLabel) === true;
  for (const id of rankBullets(ids.filter(canShorten), bank, scoreOf).reverse()) {
    if (fit.overflow === 0) break;
    const from = variants[id] ?? null;
    const before = fit.perBullet[ids.indexOf(id)];
    variants[id] = shortLabel;
    const next = measure();
    const saved = before - next.perBullet[ids.indexOf(id)];
    if (saved > 0) {
      actions.push({ kind: "short-variant", bulletId: id, from, linesSaved: saved });
      fit = next;
    } else if (from === null) {
      delete variants[id];
    } else {
      variants[id] = from;
    }
  }

  // Phase 2: drop the lowest-scoring unpinned bullet, one at a time.
  while (fit.overflow > 0) {
    const droppable = rankBullets(ids.filter((id) => !pinned.has(id)), bank, scoreOf).reverse();
    const victim = droppable[0];
    if (victim === undefined) break; // only pins left: report the overflow, never cut a pin
    const saved = fit.perBullet[ids.indexOf(victim)];
    ids = ids.filter((id) => id !== victim);
    delete variants[victim];
    delete overrides[victim];
    actions.push({ kind: "drop", bulletId: victim, linesSaved: saved });
    fit = measure();
  }

  const onPage = new Set(ids);
  const keep = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([id]) => onPage.has(id)));
  return { bulletIds: ids, variants: keep(variants), overrides: keep(overrides), actions, fit };
}
