"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { deleteBullet, insertBullets, updateBullet } from "@/lib/repos/projects";
import { oneOrNull } from "@/lib/repos/db";
import { parsePointForm } from "@/lib/bank/display";

export interface PointState {
  error?: string;
  /** Bumped on every successful save, so the editor knows to close. */
  saved?: number;
}

async function ws() {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  return w;
}

/** A point feeds the CVs of every unsent application, so those pages refresh too. */
function refresh() {
  revalidatePath("/app/bank");
  revalidatePath("/app", "layout");
}

/** Save an edited point (field `id`) or add a new one to a role (field `projectId`). */
export async function savePointAction(_prev: PointState, f: FormData): Promise<PointState> {
  const { db, userId } = await ws();
  const parsed = parsePointForm(f);
  if (!parsed.ok) return { error: parsed.error };

  const id = String(f.get("id") ?? "");
  const projectId = String(f.get("projectId") ?? "");
  try {
    if (id) {
      await updateBullet(db, userId, id, parsed.value);
    } else {
      const role = await oneOrNull(db.from("projects").select().eq("user_id", userId).eq("id", projectId).maybeSingle(), "projects", "get");
      if (!role) return { error: "That role is no longer in your bank." };
      await insertBullets(db, userId, projectId, [parsed.value]);
    }
  } catch {
    return { error: "Couldn't save the point. Try again." };
  }
  refresh();
  return { saved: Date.now() };
}

export async function deletePointAction(_prev: PointState, f: FormData): Promise<PointState> {
  const { db, userId } = await ws();
  const id = String(f.get("id") ?? "");
  if (!id) return { error: "Nothing to delete." };
  try {
    await deleteBullet(db, userId, id);
  } catch {
    return { error: "Couldn't delete the point. Try again." };
  }
  refresh();
  return { saved: Date.now() };
}
