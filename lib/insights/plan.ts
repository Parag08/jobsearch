import type { Project } from "../types";
import type { RoleInsights, RoleRequirement } from "./role-insights";
import { topGaps } from "./role-insights";

/**
 * The gap plan's brief and prompt. Code decides what the gaps are and which kind each is
 * (role-insights.ts); the model only words the plan. The prompt carries terms, shares and
 * role names - never a posting or a CV (token rule #2) - and forbids claiming experience
 * the brief does not list (honesty rule).
 */
export interface PlanGap {
  term: string;
  /** Percent of the roles asking, whole number. */
  askedBy: number;
  kind: "unstated" | "gap";
  /** Wordings the postings use, up to three. */
  phrases: string[];
  /** For `unstated`: the roles in the history that mention it. */
  mentionedIn: string[];
}

export interface PlanBrief {
  /** What the user calls this line of work, e.g. "forward-deployed-engineering". */
  label: string;
  rolesSeen: number;
  gaps: PlanGap[];
  /** What the bank already backs, most demanded first: context so the plan does not repeat it. */
  strengths: string[];
}

const percent = (r: RoleRequirement) => Math.round(r.share * 100);

/** Null when there is nothing to plan: no roles read, or nothing unbacked. */
export function buildPlanBrief(label: string, insights: RoleInsights, projects: Project[], maxGaps: number): PlanBrief | null {
  const gaps = topGaps(insights, maxGaps);
  if (insights.roles === 0 || gaps.length === 0) return null;
  const projectName = new Map(projects.map((p) => [p.id, p.role ? `${p.role}, ${p.org}` : p.org]));
  return {
    label,
    rolesSeen: insights.roles,
    gaps: gaps.map((r) => ({
      term: r.term,
      askedBy: percent(r),
      kind: r.status === "unstated" ? "unstated" : "gap",
      phrases: r.phrases.slice(0, 3),
      mentionedIn: r.projectIds.flatMap((id) => projectName.get(id) ?? []),
    })),
    strengths: insights.requirements.filter((r) => r.status === "evidenced").slice(0, maxGaps).map((r) => r.term),
  };
}

export function buildRolePlanPrompt(brief: PlanBrief): string {
  const line = (g: PlanGap) =>
    g.kind === "unstated"
      ? `- ${g.term} (asked by ${g.askedBy}% of roles; postings say: ${g.phrases.join(", ")}). UNSTATED: the candidate's history mentions it under ${g.mentionedIn.join("; ")}, but no CV bullet says it.`
      : `- ${g.term} (asked by ${g.askedBy}% of roles; postings say: ${g.phrases.join(", ")}). GAP: nothing on record.`;
  return [
    `You are helping a job seeker close the gap between their CV and ${brief.rolesSeen} "${brief.label}" roles they have collected.`,
    "Below is what those roles ask for that the CV does not back, most demanded first.",
    "",
    ...brief.gaps.map(line),
    "",
    `Already backed by the CV (do not plan for these): ${brief.strengths.join(", ") || "nothing yet"}.`,
    "",
    "Write a plan in plain text, no markdown symbols. One short paragraph per item above, in the same order, starting with the item's name and a colon.",
    "For an UNSTATED item: say to write a CV bullet for it from the role named, and what that bullet should show (outcome, scale). Do not write the bullet and do not invent what happened.",
    "For a GAP item: give one concrete way to build real evidence in the next few weeks (a small project, a certification, a piece of work to volunteer for), and what would count as done.",
    "Never say or imply the candidate already has a skill marked GAP. Use no numbers other than the percentages given. End with one line naming the two items to start with and why.",
  ].join("\n");
}
