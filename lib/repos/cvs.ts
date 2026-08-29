import type { MasterCv } from "../types";
import { many, one, oneOrNull, type DbClient } from "./db";
import {
  applicationCvRow,
  masterCvRow,
  toMasterCv,
  toStoredApplicationCv,
  type StoredApplicationCv,
} from "./rows";

export type NewMasterCv = Omit<MasterCv, "id">;
export type NewApplicationCv = Omit<StoredApplicationCv, "id">;

export async function insertMasterCv(db: DbClient, userId: string, cv: NewMasterCv): Promise<MasterCv> {
  const row = await one(
    db.from("master_cvs").insert(masterCvRow(userId, cv)).select().single(),
    "master_cvs",
    "insert",
  );
  return toMasterCv(row);
}

export async function getLatestMasterCv(
  db: DbClient,
  userId: string,
  roleFamily: string,
): Promise<MasterCv | null> {
  const rows = await many(
    db
      .from("master_cvs")
      .select()
      .eq("user_id", userId)
      .eq("role_family", roleFamily)
      .order("version", { ascending: false })
      .limit(1),
    "master_cvs",
    "getLatest",
  );
  return rows[0] ? toMasterCv(rows[0]) : null;
}

export async function insertApplicationCv(
  db: DbClient,
  userId: string,
  cv: NewApplicationCv,
): Promise<StoredApplicationCv> {
  const row = await one(
    db.from("application_cvs").insert(applicationCvRow(userId, cv)).select().single(),
    "application_cvs",
    "insert",
  );
  return toStoredApplicationCv(row);
}

export async function getApplicationCv(
  db: DbClient,
  userId: string,
  id: string,
): Promise<StoredApplicationCv | null> {
  const row = await oneOrNull(
    db.from("application_cvs").select().eq("user_id", userId).eq("id", id).maybeSingle(),
    "application_cvs",
    "get",
  );
  return row ? toStoredApplicationCv(row) : null;
}
