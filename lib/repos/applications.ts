import type { Application } from "../types";
import { many, one, oneOrNull, type DbClient } from "./db";
import { applicationPatch, applicationRow, toApplication } from "./rows";

export type NewApplication = Omit<Application, "id">;

/** jdRaw is stored for audit only - it never comes back on the domain object (token rule #1). */
export async function insertApplication(
  db: DbClient,
  userId: string,
  app: NewApplication,
  jdRaw: string | null = null,
): Promise<Application> {
  const row = await one(
    db.from("applications").insert(applicationRow(userId, app, jdRaw)).select().single(),
    "applications",
    "insert",
  );
  return toApplication(row);
}

export async function getApplication(
  db: DbClient,
  userId: string,
  id: string,
): Promise<Application | null> {
  const row = await oneOrNull(
    db.from("applications").select().eq("user_id", userId).eq("id", id).maybeSingle(),
    "applications",
    "get",
  );
  return row ? toApplication(row) : null;
}

export async function listApplications(db: DbClient, userId: string): Promise<Application[]> {
  const rows = await many(
    db.from("applications").select().eq("user_id", userId).order("updated_at", { ascending: false }),
    "applications",
    "list",
  );
  return rows.map(toApplication);
}

/** Persist a domain-transformed application (e.g. after pipeline.advance). jd_raw is untouched. */
export async function updateApplication(
  db: DbClient,
  userId: string,
  app: Application,
): Promise<Application> {
  const row = await one(
    db
      .from("applications")
      .update(applicationPatch(app))
      .eq("user_id", userId)
      .eq("id", app.id)
      .select()
      .single(),
    "applications",
    "update",
  );
  return toApplication(row);
}
