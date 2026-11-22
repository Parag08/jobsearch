import { oneOrNull, one, type DbClient } from "./db";

/** One user's saved settings (migration 0018): env key -> value. Empty = every default. */
const TABLE = "user_settings";

export async function getUserSettings(db: DbClient, userId: string): Promise<Record<string, string>> {
  const row = await oneOrNull(db.from(TABLE).select().eq("user_id", userId).maybeSingle(), TABLE, "get");
  const values = row?.values;
  return values && typeof values === "object" ? Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "string")) : {};
}

/** Replace the whole set: a key left out goes back to the deployment's value. */
export async function putUserSettings(db: DbClient, userId: string, values: Record<string, string>): Promise<void> {
  await one(
    db.from(TABLE).upsert({ user_id: userId, values, updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select().single(),
    TABLE,
    "put",
  );
}
