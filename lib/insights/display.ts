/**
 * The words and colours requirement statuses wear on every page (Insights, the Overview's
 * Insights tab): one source, so the two can't drift. Orange needs attention, teal is done but
 * not written down, green is on your CV (DESIGN.md section 5).
 */
import type { RequirementStatus } from "./role-insights";

export const STATUS_ORDER: RequirementStatus[] = ["gap", "unstated", "evidenced"];

export const STATUS_LABEL: Record<RequirementStatus, string> = {
  gap: "Not on record",
  unstated: "Done, not on your CV",
  evidenced: "On your CV",
};

/** What each group means, said once under its heading. */
export const STATUS_SUB: Record<RequirementStatus, string> = {
  gap: "Nothing in your history backs these yet.",
  unstated: "Your history mentions these, but no point in your Experience says so. Add one.",
  evidenced: "At least one point in your Experience says so.",
};

/** The summary-panel tone (ui.module.css: attention, mid, good). */
export const STATUS_TONE: Record<RequirementStatus, "attention" | "mid" | "good"> = {
  gap: "attention",
  unstated: "mid",
  evidenced: "good",
};

export function statusCounts(reqs: { status: RequirementStatus }[]): Record<RequirementStatus, number> {
  const out = { gap: 0, unstated: 0, evidenced: 0 };
  for (const r of reqs) out[r.status] += 1;
  return out;
}

/** "Based on 2 of your 5 roles": the insights never hide how much they rest on. */
export function basedOn(read: number, total: number): string {
  if (read === total) return read === 1 ? "Based on your 1 role" : `Based on all ${read} of your roles`;
  return `Based on ${read} of your ${total} roles`;
}
