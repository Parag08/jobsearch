import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase, readSupabaseEnv } from "@/lib/db/supabase";

/**
 * OAuth return leg (onboarding screen 0). Exchanges the provider code for a
 * session cookie, then lands the user in the app. Login and LinkedIn import
 * are separate things (docs/ONBOARDING.md): this only signs in.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const env = readSupabaseEnv();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/app";
  if (!env || !code) return NextResponse.redirect(new URL("/signin?error=missing_code", url.origin));

  const supabase = await createServerSupabase(env);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(error.message)}`, url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
