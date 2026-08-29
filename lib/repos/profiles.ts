import { one, oneOrNull, type DbClient } from "./db";
import { profileRow, toProfile, type Profile } from "./rows";

export async function getProfile(db: DbClient, userId: string): Promise<Profile | null> {
  const row = await oneOrNull(
    db.from("profiles").select().eq("user_id", userId).maybeSingle(),
    "profiles",
    "get",
  );
  return row ? toProfile(row) : null;
}

export async function saveProfile(db: DbClient, profile: Profile): Promise<Profile> {
  const row = await one(
    db.from("profiles").upsert(profileRow(profile), { onConflict: "user_id" }).select().single(),
    "profiles",
    "save",
  );
  return toProfile(row);
}
