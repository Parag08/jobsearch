import type { SectorNode } from "../types";
import { many, one, oneOrNull, type DbClient } from "./db";
import { sectorRow, toSectorNode } from "./rows";

/**
 * Sector graph persistence (M1). Domain node ids (path slugs from
 * findOrCreateNode) are provisional: saves omit them and the DB identity
 * (uuid, conflict target user_id+path) comes back on the returned node.
 */
export async function saveSector(db: DbClient, userId: string, node: SectorNode): Promise<SectorNode> {
  const row = await one(
    db.from("sectors").upsert(sectorRow(userId, node), { onConflict: "user_id,path" }).select().single(),
    "sectors",
    "save",
  );
  return toSectorNode(row);
}

export async function getSectorByPath(
  db: DbClient,
  userId: string,
  path: string[],
): Promise<SectorNode | null> {
  const row = await oneOrNull(
    db.from("sectors").select().eq("user_id", userId).eq("path", path).maybeSingle(),
    "sectors",
    "getByPath",
  );
  return row ? toSectorNode(row) : null;
}

export async function listSectors(db: DbClient, userId: string): Promise<SectorNode[]> {
  const rows = await many(db.from("sectors").select().eq("user_id", userId), "sectors", "list");
  return rows.map(toSectorNode);
}
