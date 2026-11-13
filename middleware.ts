import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { signedInRedirect } from "./lib/auth/routing";
import { readSupabaseEnv } from "./lib/db/supabase";

/**
 * Keeps the Supabase session alive and routes signed-in visitors.
 *
 * Server Components cannot write cookies, so without this the access token expired after
 * about an hour and every page sent the user back to /signin. Here, on every request,
 * getUser() refreshes the token and the new cookies go out on the response (the
 * @supabase/ssr pattern). A signed-in visitor on / or /signin goes straight to /app.
 * Demo mode (Supabase unconfigured) has no session, so nothing happens.
 */
export async function middleware(request: NextRequest) {
  const env = readSupabaseEnv();
  if (!env) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // Must run before anything else reads the session: it is what refreshes the token.
  const { data } = await supabase.auth.getUser();

  const to = signedInRedirect(request.nextUrl.pathname, Boolean(data.user));
  if (!to) return response;
  const redirect = NextResponse.redirect(new URL(to, request.url));
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  // Everything except static assets and images, and the MCP endpoint (token auth, no session to refresh).
  matcher: ["/((?!api/mcp|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
