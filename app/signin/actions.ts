"use server";

import { cookies, headers } from "next/headers";
import { DEMO_COOKIE, DEMO_KITS_COOKIE } from "@/lib/demo/visitors";
import { redirect } from "next/navigation";
import { createServerSupabase, readSupabaseEnv } from "@/lib/db/supabase";

export type Provider = "google" | "linkedin_oidc";

/** Start the OAuth leg; the provider sends the browser back to /auth/callback. */
export async function signInWith(provider: Provider): Promise<void> {
  const env = readSupabaseEnv();
  if (!env) redirect("/signin?error=not_configured");
  // Signing in ends a demo visit, or the sample workspace would keep winning (lib/db getWorkspace).
  const jar = await cookies();
  jar.delete(DEMO_COOKIE);
  jar.delete(DEMO_KITS_COOKIE);
  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const supabase = await createServerSupabase(env);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data.url) redirect(`/signin?error=${encodeURIComponent(error?.message ?? "no_redirect_url")}`);
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const env = readSupabaseEnv();
  if (env) {
    const supabase = await createServerSupabase(env);
    await supabase.auth.signOut();
  }
  redirect("/");
}
