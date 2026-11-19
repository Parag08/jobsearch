/**
 * How the Watchlist page presents itself (DESIGN.md section 5, Watchlist): board names people
 * recognise, the filters as one line, posting age in days, and the order roles are shown in.
 * Pure, so the page stays thin and this stays tested.
 */
import type { AtsKind } from "./ats";

const ATS_NAME: Record<Exclude<AtsKind, "unknown">, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
};

/** The board's name when we read it daily; null when it has to be checked by hand. */
export function atsLabel(ats: AtsKind): string | null {
  return ats === "unknown" ? null : ATS_NAME[ats];
}

const CITIES_SHOWN = 2;

/** "Singapore · 2 titles · 1 skipped": what the closed filter panel says it is doing. */
export function targetSummary(t: { targetGeos: string[]; targetTitles: string[]; excludedTitles: string[] }): string {
  const parts: string[] = [];
  if (t.targetGeos.length) {
    const more = t.targetGeos.length - CITIES_SHOWN;
    parts.push(t.targetGeos.slice(0, CITIES_SHOWN).join(", ") + (more > 0 ? ` +${more}` : ""));
  }
  if (t.targetTitles.length) parts.push(`${t.targetTitles.length} title${t.targetTitles.length === 1 ? "" : "s"}`);
  if (t.excludedTitles.length) parts.push(`${t.excludedTitles.length} skipped`);
  return parts.length ? parts.join(" · ") : "Every city and title";
}

const DAY_MS = 86_400_000;
const RECENT_DAYS = 14;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Posted today / yesterday / 9 days ago", then "Posted 2 Sep"; null when the board gave no date. */
export function postedLabel(postedAt: string | null, today: string): string | null {
  if (!postedAt) return null;
  const day = postedAt.slice(0, 10);
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS);
  if (Number.isNaN(days)) return null;
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < RECENT_DAYS) return `Posted ${days} days ago`;
  const d = new Date(`${day}T00:00:00Z`);
  return `Posted ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Shortlisted first, then the best fit (when scored), then the newest posting. */
export function orderRoles<T extends { status: string; score: number | null; postedAt: string | null }>(roles: T[]): T[] {
  return [...roles].sort(
    (a, b) =>
      Number(b.status === "shortlisted") - Number(a.status === "shortlisted") ||
      (b.score ?? -1) - (a.score ?? -1) ||
      (b.postedAt ?? "").localeCompare(a.postedAt ?? ""),
  );
}

/** Directory companies whose board we can read and that you don't watch yet, by name. */
export function suggestedCompanies<T extends { name: string; ats: string; token: string | null }>(directory: T[], watched: Set<string>): T[] {
  return directory
    .filter((c) => c.ats !== "unknown" && c.token && !watched.has(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}
