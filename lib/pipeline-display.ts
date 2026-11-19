/**
 * How an application card presents itself on the board: the role family as a tag, a
 * colour for that tag, and a company monogram for the badge. Pure and deterministic, so
 * the same company or family always gets the same colour.
 */

/** The tag colours the board can use (each maps to a system colour pair in ui.module.css). */
export const TONES = ["blue", "indigo", "purple", "teal", "orange", "pink"] as const;
export type Tone = (typeof TONES)[number];

/** "product-management" -> "Product management". */
export function familyLabel(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const JOINERS = new Set(["&", "and", "the", "of"]);

/** "BCG (Boston ...)" -> "BCG", "Bain & Company" -> "BC", "Microsoft" -> "M". */
export function monogram(company: string): string {
  const words = company.trim().split(/\s+/).filter((w) => w && !JOINERS.has(w.toLowerCase()) && /^[\p{L}\p{N}]/u.test(w));
  if (!words.length) return "?";
  const first = words[0]!;
  if (/^[A-Z0-9]{2,4}$/.test(first)) return first;
  if (words.length === 1) return first.charAt(0).toUpperCase();
  return (first.charAt(0) + words[1]!.charAt(0)).toUpperCase();
}

/** A stable tone for any key (FNV-1a hash). */
export function toneFor(key: string): Tone {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return TONES[h % TONES.length]!;
}
