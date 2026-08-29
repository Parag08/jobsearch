import { one, oneOrNull, type DbClient } from "./db";
import { briefRow, toBrief, type Brief } from "./rows";

/** One brief per (user, date): regeneration overwrites. */
export async function saveBrief(db: DbClient, userId: string, brief: Brief): Promise<Brief> {
  const row = await one(
    db.from("briefs").upsert(briefRow(userId, brief), { onConflict: "user_id,date" }).select().single(),
    "briefs",
    "save",
  );
  return toBrief(row);
}

export async function getBrief(db: DbClient, userId: string, date: string): Promise<Brief | null> {
  const row = await oneOrNull(
    db.from("briefs").select().eq("user_id", userId).eq("date", date).maybeSingle(),
    "briefs",
    "get",
  );
  return row ? toBrief(row) : null;
}
