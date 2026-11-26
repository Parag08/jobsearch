import "server-only";
import type { DbClient } from "../repos/db";
import type { FileStore } from "../export/file-store";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEMO_USER_ID, getDemoDb, getVisitorDemoDb } from "./demo";
import { DEMO_COOKIE, DEMO_KITS_COOKIE, demoMaxVisitorsFromEnv } from "../demo/visitors";
import { demoCookieOptions, demoSigningSecret } from "../demo/visitor-token";
import { readNodeDemoVisitor } from "../demo/node-mac";
import { restoreDemoKits, writeDemoKits } from "./demo-kits";
import { asDbClient, createServerSupabase, readSupabaseEnv, requireWorkspaceEnv } from "./supabase";

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
  persistDemoKits?: () => Promise<void>;
}

/**
 * Resolve the request's workspace: a public demo visitor first (cookie), then live with a session or
 * the local demo when explicitly enabled without Supabase. Returns null for signed-out live users.
 * Missing Supabase configuration outside the local demo is an error.
 */
export const getWorkspace = cache(resolveWorkspace);

/**
 * The uncached resolver. getWorkspace wraps it in React's cache(), so the layout, the page
 * and anything else in one request share one answer - one Supabase auth round trip instead
 * of one per caller (it was two per page, plus middleware's).
 */
async function resolveWorkspace(): Promise<Workspace | null> {
  const env = requireWorkspaceEnv();
  // A public demo visitor (the /demo route set the cookie) gets their own fictional workspace,
  // even when Supabase is configured. Unset DEMO_MAX_VISITORS and the cookie is ignored.
  const jar = await cookies();
  const maxVisitors = demoMaxVisitorsFromEnv(process.env);
  const secret = maxVisitors ? demoSigningSecret() : undefined;
  const visitor = maxVisitors ? readNodeDemoVisitor(jar.get(DEMO_COOKIE)?.value, secret) : null;
  if (visitor && maxVisitors) {
    const db = getVisitorDemoDb(visitor.id, maxVisitors);
    const journal = jar.get(DEMO_KITS_COOKIE)?.value;
    if (secret && journal && visitor.expiresAt !== null) restoreDemoKits(db, journal, visitor.id, secret);
    const persistDemoKits = secret ? async () => {
      const token = writeDemoKits(db, visitor.id, secret);
      jar.set(DEMO_KITS_COOKIE, token, demoCookieOptions());
    } : undefined;
    return { db, userId: DEMO_USER_ID, mode: "demo", email: null, files: null, cannedAi: true, persistDemoKits };
  }
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
