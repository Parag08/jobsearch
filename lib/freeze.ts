import type { Bullet } from "./types";
import type { SentSnapshot, StoredApplicationCv } from "./repos/rows";

/**
 * Freeze on send (docs/DESIGN.md section 2). A stored application CV is a live
 * RECIPE - bullet ids into a mutable bank - so once the document has left the
 * user's hands we snapshot the resolved text. The snapshot only records what
 * was sent; the bank and the masters stay fully editable afterwards.
 *
 * Resolution order per bullet mirrors the editorial layer: override > variant
 * > base text. A bullet the bank no longer holds is kept with text null rather
 * than dropped - the page had a line there, and pretending otherwise would
 * misdescribe what was sent.
 */
export function snapshotCv(cv: StoredApplicationCv, bank: Record<string, Bullet>): SentSnapshot {
  const variants = cv.diff.variants ?? {};
  const overrides = cv.diff.overrides ?? {};
  return {
    bullets: cv.bulletIds.map((bulletId) => {
      const b = bank[bulletId];
      if (!b) return { bulletId, text: null };
      const override = overrides[bulletId];
      if (override !== undefined) return { bulletId, text: override };
      const label = variants[bulletId];
      const v = label !== undefined ? b.variants?.find((x) => x.label === label) : undefined;
      return { bulletId, text: v ? v.text : b.text };
    }),
    summaryLine: cv.summaryLine,
  };
}
