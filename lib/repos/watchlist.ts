import { WatchlistEntrySchema, type NewWatchlistEntry, type WatchlistEntry } from "../watchlist/types";
import { manyByPage, many, one, RepoError, type DbClient } from "./db";
import type { WatchlistRow } from "./rows";

export type { WatchlistRow };

/**
 * Watchlist persistence (DESIGN.md section 4). The row type lives in rows.ts
 * with the other tables (schema.sql `watchlist`); the snake<->camel mappers
 * for this table live here.
 */

// ---- mappers (the only place snake<->camel lives for this table) ---------------

export function toWatchlistEntry(r: WatchlistRow): WatchlistEntry {
  return WatchlistEntrySchema.parse({
    id: r.id,
    ...(r.company_id !== undefined && { companyId: r.company_id }),
    ...(r.last_success_at !== undefined && { lastSuccessAt: r.last_success_at }),
    ...(r.last_attempt_at !== undefined && { lastAttemptAt: r.last_attempt_at }),
    ...(r.last_check_failed !== undefined && { lastCheckFailed: r.last_check_failed }),
    company: r.company,
    careersUrl: r.careers_url,
    ats: r.ats,
    token: r.token,
    active: r.active,
    addedAt: r.added_at,
  });
}

export function watchlistRow(userId: string, e: NewWatchlistEntry): Omit<WatchlistRow, "id"> {
  return {
    user_id: userId,
    ...(e.companyId !== undefined && { company_id: e.companyId }),
    company: e.company,
    careers_url: e.careersUrl,
    ats: e.ats,
    token: e.token,
    active: e.active,
    added_at: e.addedAt,
  };
}

// ---- repo ------------------------------------------------------------------------

/** Upsert on (user, careers_url): pasting the same board twice updates, never duplicates. */
export async function addWatchlistEntry(
  db: DbClient,
  userId: string,
  entry: NewWatchlistEntry,
): Promise<WatchlistEntry> {
  const row = await one(
    db
      .from("watchlist")
      .upsert(watchlistRow(userId, entry), { onConflict: "user_id,careers_url" })
      .select()
      .single(),
    "watchlist",
    "add",
  );
  return toWatchlistEntry(row);
}

export async function listWatchlist(
  db: DbClient,
  userId: string,
  opts: { active?: boolean } = {},
): Promise<WatchlistEntry[]> {
  let q = db.from("watchlist").select("id,company_id,last_success_at,last_attempt_at,last_check_failed,company,careers_url,ats,token,active,added_at").eq("user_id", userId);
  if (opts.active !== undefined) q = q.eq("active", opts.active);
  const rows = await manyByPage(q.order("company").order("id"), "watchlist", "list");
  return rows.map(toWatchlistEntry);
}

export async function setWatchlistActive(
  db: DbClient,
  userId: string,
  id: string,
  active: boolean,
): Promise<WatchlistEntry> {
  const row = await one(
    db.from("watchlist").update({ active }).eq("user_id", userId).eq("id", id).select().single(),
    "watchlist",
    "setActive",
  );
  return toWatchlistEntry(row);
}

export async function removeWatchlistEntry(db: DbClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from("watchlist").delete().eq("user_id", userId).eq("id", id);
  if (error) throw new RepoError("watchlist", "remove", error.message);
}
