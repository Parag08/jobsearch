import "server-only";
import type { DbClient } from "../repos/db";
import type { FileStore } from "../export/file-store";
import { cookies } from "next/headers";
import { DEMO_USER_ID, getDemoDb, getVisitorDemoDb } from "./demo";
import { DEMO_COOKIE, demoMaxVisitorsFromEnv, isVisitorId } from "../demo/visitors";
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
  /**
   * True for a public demo visitor: every AI feature answers from lib/demo/canned.ts and no
   * provider is ever called (lib/services/ai-write.ts). False everywhere else.
   */
  cannedAi: boolean;
}

/**
 * Resolve the request's workspace. A demo visitor first (cookie); then live when Supabase is configured and the
 * request carries a session; demo when Supabase is not configured at all;
 * null when Supabase is configured but nobody is signed in (callers redirect
 * to /signin). One function, so every page and route agrees on the mode.
 */
export async function getWorkspace(): Promise<Workspace | null> {
  // A public demo visitor (the /demo route set the cookie) gets their own fictional workspace,
  // even when Supabase is configured. Unset DEMO_MAX_VISITORS and the cookie is ignored.
  const visitor = (await cookies()).get(DEMO_COOKIE)?.value;
  const maxVisitors = demoMaxVisitorsFromEnv(process.env);
  if (visitor && maxVisitors && isVisitorId(visitor)) {
    return { db: getVisitorDemoDb(visitor, maxVisitors), userId: DEMO_USER_ID, mode: "demo", email: null, files: null, cannedAi: true };
  }
  const env = readSupabaseEnv();
  if (!env) {
    return { db: getDemoDb(), userId: DEMO_USER_ID, mode: "demo", email: null, files: null, cannedAi: false };
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
  return { db: asDbClient(supabase), userId: data.user.id, mode: "live", email: data.user.email ?? null, files, cannedAi: false };
}

export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== null;
}
