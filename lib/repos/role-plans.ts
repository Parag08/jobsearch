import { z } from "zod";
import { oneOrNull, one, type DbClient } from "./db";

/**
 * The gap plan for one role family (role_plans, migration 0010). One row per
 * (user, role family): saving again replaces the plan.
 */
export const StoredRolePlanSchema = z.object({
  roleFamily: z.string().min(1),
  /** The plan the user reads: paragraphs or list lines, plain text. */
  text: z.string(),
  /** The gap terms the plan was written from, most demanded first. */
  gaps: z.array(z.string()),
  /** How many roles of this family had been read when it was written. */
  rolesSeen: z.number().int().nonnegative(),
  model: z.string().nullable(),
  generatedAt: z.string(), // ISO date or timestamp
});
export type StoredRolePlan = z.infer<typeof StoredRolePlanSchema>;

export async function getRolePlan(db: DbClient, userId: string, roleFamily: string): Promise<StoredRolePlan | null> {
  const row = await oneOrNull(
    db.from("role_plans").select().eq("user_id", userId).eq("role_family", roleFamily).maybeSingle(),
    "role_plans",
    "getRolePlan",
  );
  const parsed = StoredRolePlanSchema.safeParse(row?.plan);
  return parsed.success ? parsed.data : null;
}

export async function saveRolePlan(db: DbClient, userId: string, plan: StoredRolePlan): Promise<StoredRolePlan> {
  const valid = StoredRolePlanSchema.parse(plan);
  await one(
    db
      .from("role_plans")
      .upsert(
        { user_id: userId, role_family: valid.roleFamily, plan: valid, generated_at: new Date().toISOString() },
        { onConflict: "user_id,role_family" },
      )
      .select()
      .single(),
    "role_plans",
    "saveRolePlan",
  );
  return valid;
}
