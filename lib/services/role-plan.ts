import type { DbClient } from "../repos/db";
import { listApplications } from "../repos/applications";
import { getProfile } from "../repos/profiles";
import { listProjects } from "../repos/projects";
import { saveRolePlan, type StoredRolePlan } from "../repos/role-plans";
import { roleInsights, selectRoles, type RoleSelector } from "../insights/role-insights";
import { buildPlanBrief, buildRolePlanPrompt } from "../insights/plan";

export interface DraftRolePlanDeps {
  db: DbClient;
  /** One premium-tier completion (token rule #5); the caller logs it to the ledger. */
  write: (prompt: string) => Promise<string>;
  model?: string | null;
  /** How many gaps the plan covers (ROLE_PLAN_MAX_GAPS). */
  maxGaps: number;
}

/** The stored plan's key for a selection: the family, or the title words when there is no family. */
export function planKey(by: RoleSelector): string {
  return [by.family ?? "", by.title ? `title:${by.title.trim().toLowerCase()}` : ""].filter(Boolean).join(" ");
}

/**
 * Draft the gap plan for one line of work: rules pick and classify the gaps, one premium
 * call words the plan, and it is stored (one per selection; asking again replaces it).
 */
export async function draftRolePlan(
  { db, write, model = null, maxGaps }: DraftRolePlanDeps,
  userId: string,
  by: RoleSelector,
  today: string,
): Promise<StoredRolePlan | { needs: "gaps" }> {
  const [apps, projects, profile] = await Promise.all([listApplications(db, userId), listProjects(db, userId), getProfile(db, userId)]);
  const insights = roleInsights(selectRoles(apps, by), projects, profile?.taxonomy ?? { tags: {} });
  const key = planKey(by);
  const brief = buildPlanBrief(key, insights, projects, maxGaps);
  if (!brief) return { needs: "gaps" };

  const text = (await write(buildRolePlanPrompt(brief))).trim();
  if (!text) throw new Error("The writer returned nothing - try again.");
  return saveRolePlan(db, userId, {
    roleFamily: key,
    text,
    gaps: brief.gaps.map((g) => g.term),
    rolesSeen: brief.rolesSeen,
    model,
    generatedAt: today,
  });
}
