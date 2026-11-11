import "server-only";
import type { DbClient } from "../repos/db";
import type { FileStore } from "../export/file-store";
import { DEMO_USER_ID, getDemoDb } from "./demo";
import { asDbClient, createServerSupabase, readSupabaseEnv } from "./supabase";

export type WorkspaceMode = "live" | "demo";

export interface Workspace {
  db: DbClient;
  userId: string;
  mode: WorkspaceMode;
  /** Signed-in user's email (live) - null in demo. */
  email: string | null;
  /** Private per-user file storage (live, with CV_EXPORT_BUCKET set) - null otherwise. */
  files: FileStore | null;
}

/**
 * Resolve the request's workspace. Live when Supabase is configured and the
 * request carries a session; demo when Supabase is not configured at all;
 * null when Supabase is configured but nobody is signed in (callers redirect
 * to /signin). One function, so every page and route agrees on the mode.
 */
export async function getWorkspace(): Promise<Workspace | null> {
  const env = readSupabaseEnv();
  if (!env) {
    return { db: getDemoDb(), userId: DEMO_USER_ID, mode: "demo", email: null, files: null };
  }
  const supabase = await createServerSupabase(env);
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const bucket = process.env.CV_EXPORT_BUCKET;
  const files: FileStore | null = bucket
    ? {
        // Runs as the signed-in user, so the bucket's own-folder policies apply (migration 0006).
        async upload(path, bytes, contentType) {
          const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
          if (error) throw new Error(`storage upload failed: ${error.message}`);
        },
      }
    : null;
  return { db: asDbClient(supabase), userId: data.user.id, mode: "live", email: data.user.email ?? null, files };
}

export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== null;
}
