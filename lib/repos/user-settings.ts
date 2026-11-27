import { oneOrNull, one, many, type DbClient } from "./db";

/** One user's saved settings (migration 0018): env key -> value. Empty = every default. */
const TABLE = "user_settings";

export async function getUserSettings(db: DbClient, userId: string): Promise<Record<string, string>> {
  return (await getUserSettingsVersion(db, userId)).values;
}

export async function getUserSettingsVersion(db: DbClient, userId: string) {
  const row = await oneOrNull(db.from(TABLE).select().eq("user_id", userId).maybeSingle(), TABLE, "get");
  const values = row?.values;
  return {
    exists: row !== null,
    updatedAt: row?.updated_at,
    values: values && typeof values === "object" ? Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "string")) : {},
  };
}

export async function putUserSettingsVersion(db: DbClient, userId: string,
  previous: { exists: boolean; updatedAt?: string }, values: Record<string, string>): Promise<boolean> {
  const updated_at = new Date(Math.max(Date.now(), (Date.parse(previous.updatedAt ?? "") || 0) + 1)).toISOString();
  const next = { values, updated_at };
  if (!previous.exists) {
    const rows = await many(db.from(TABLE).upsert({ user_id: userId, ...next }, { onConflict: "user_id", ignoreDuplicates: true }).select(), TABLE, "insert settings");
    return rows.length === 1;
  }
  const write = db.from(TABLE).update(next).eq("user_id", userId);
  const rows = await many((previous.updatedAt ? write.eq("updated_at", previous.updatedAt) : write.is("updated_at", null)).select(), TABLE, "update settings");
  return rows.length === 1;
}

/** Replace the whole set: a key left out goes back to the deployment's value. */
export async function putUserSettings(db: DbClient, userId: string, values: Record<string, string>): Promise<void> {
  await one(
    db.from(TABLE).upsert({ user_id: userId, values, updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select().single(),
    TABLE,
    "put",
  );
}
