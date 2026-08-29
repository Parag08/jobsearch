import type { Bullet, Project } from "../types";
import { many, one, type DbClient } from "./db";
import { bulletRow, projectRow, toBullet, toProject } from "./rows";

export type NewProject = Omit<Project, "id" | "bullets">;
export type NewBullet = Omit<Bullet, "id" | "projectId">;

export async function insertProject(db: DbClient, userId: string, p: NewProject): Promise<Project> {
  const row = await one(
    db.from("projects").insert(projectRow(userId, p)).select().single(),
    "projects",
    "insert",
  );
  return toProject(row, []);
}

export async function insertBullets(
  db: DbClient,
  userId: string,
  projectId: string,
  bullets: NewBullet[],
): Promise<Bullet[]> {
  const rows = await many(
    db.from("bullets").insert(bullets.map((b) => bulletRow(userId, projectId, b))).select(),
    "bullets",
    "insert",
  );
  return rows.map(toBullet);
}

/** Projects with their bullets composed (two queries, grouped client-side). */
export async function listProjects(db: DbClient, userId: string): Promise<Project[]> {
  const [projectRows, bulletRows] = await Promise.all([
    many(db.from("projects").select().eq("user_id", userId), "projects", "list"),
    many(db.from("bullets").select().eq("user_id", userId), "bullets", "list"),
  ]);
  const byProject = new Map<string, Bullet[]>();
  for (const r of bulletRows) {
    const list = byProject.get(r.project_id) ?? [];
    list.push(toBullet(r));
    byProject.set(r.project_id, list);
  }
  return projectRows.map((r) => toProject(r, byProject.get(r.id) ?? []));
}

export async function listBulletsByRoleFamily(
  db: DbClient,
  userId: string,
  roleFamily: string,
): Promise<Bullet[]> {
  const rows = await many(
    db.from("bullets").select().eq("user_id", userId).eq("role_family", roleFamily),
    "bullets",
    "listByRoleFamily",
  );
  return rows.map(toBullet);
}
