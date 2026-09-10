import { WatchlistEntrySchema, type NewWatchlistEntry, type WatchlistEntry } from "../watchlist/types";
import type { AtsKind } from "../watchlist/ats";
import { many, one, RepoError, type DbClient } from "./db";

/**
 * Watchlist persistence (DESIGN.md section 4). Row shape mirrors
 * supabase/_pending/watchlist.sql; the row type and its mappers live here
 * (not in rows.ts) until the table is folded into schema.sql. Registering the
 * table on RowMap via module augmentation is what lets db.from("watchlist")
 * type-check against the shared DbClient without editing rows.ts.
 */
export interface WatchlistRow {
  id: string;
  user_id: string;
  company: string;
  careers_url: string;
  ats: AtsKind;
  token: string | null;
  active: boolean;
  added_at: string;
  created_at?: string;
}

declare module "./rows" {
  interface RowMap {
    watchlist: WatchlistRow;
  }
}

// ---- mappers (the only place snake<->camel lives for this table) ---------------

export function toWatchlistEntry(r: WatchlistRow): WatchlistEntry {
  return WatchlistEntrySchema.parse({
    id: r.id,
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
  let q = db.from("watchlist").select().eq("user_id", userId);
  if (opts.active !== undefined) q = q.eq("active", opts.active);
  const rows = await many(q.order("company", { ascending: true }), "watchlist", "list");
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
