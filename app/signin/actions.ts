"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase, readSupabaseEnv } from "@/lib/db/supabase";

export type Provider = "google" | "linkedin_oidc";

/** Start the OAuth leg; the provider sends the browser back to /auth/callback. */
export async function signInWith(provider: Provider): Promise<void> {
  const env = readSupabaseEnv();
  if (!env) redirect("/signin?error=not_configured");
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
