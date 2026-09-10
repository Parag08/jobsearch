import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { DbClient } from "../repos/db";

/** Publishable (anon) credentials - RLS does the real access control. */
export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

/** Read the app-facing Supabase env; null when not configured (=> demo mode). */
export function readSupabaseEnv(env: Record<string, string | undefined> = process.env): SupabaseEnv | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

/**
 * Server-side Supabase client bound to the request's auth cookies, so every
 * query runs as the signed-in user and RLS applies. Cookie writes are
 * best-effort: Server Components cannot set cookies (the middleware / route
 * handlers do), so the setAll failure is swallowed as supabase/ssr documents.
 */
export async function createServerSupabase(env: SupabaseEnv) {
  const store = await cookies();
  return createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          /* read-only cookie store (Server Component render) */
        }
      },
    },
  });
}

/** The supabase-js query chain satisfies DbClient structurally; the cast is the seam. */
export function asDbClient(client: { from: (table: string) => unknown }): DbClient {
  return client as unknown as DbClient;
}
