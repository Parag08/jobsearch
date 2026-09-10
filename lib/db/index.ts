import "server-only";
import type { DbClient } from "../repos/db";
import { DEMO_USER_ID, getDemoDb } from "./demo";
import { asDbClient, createServerSupabase, readSupabaseEnv } from "./supabase";

export type WorkspaceMode = "live" | "demo";

export interface Workspace {
  db: DbClient;
  userId: string;
  mode: WorkspaceMode;
  /** Signed-in user's email (live) - null in demo. */
  email: string | null;
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
    return { db: getDemoDb(), userId: DEMO_USER_ID, mode: "demo", email: null };
  }
  const supabase = await createServerSupabase(env);
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { db: asDbClient(supabase), userId: data.user.id, mode: "live", email: data.user.email ?? null };
}

export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== null;
}
