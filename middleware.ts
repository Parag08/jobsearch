import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { signedInRedirect } from "./lib/auth/routing";
import { SETTINGS_PATH, settingsHref, settingsSection } from "./lib/settings/sections";
import { requireWorkspaceEnv } from "./lib/db/supabase";
import { DEMO_COOKIE, DEMO_KITS_COOKIE, DEMO_TTL_SECONDS, demoMaxVisitorsFromEnv } from "./lib/demo/visitors";
import { demoSigningSecret, readDemoVisitor, setSignedDemoLease } from "./lib/demo/visitor-token";

const leaseRenewalIntervalMs = 15 * 60 * 1000;
const supabaseSessionCookie = /^sb-.+-auth-token(?:\.\d+)?$/;

async function renewDemoVisit(request: NextRequest, response: NextResponse) {
  const path = request.nextUrl.pathname;
  if (request.method !== "GET" || !(path === "/app" || path.startsWith("/app/") ||
    path.startsWith("/api/export/safe-sourcing/")) || !demoMaxVisitorsFromEnv(process.env)) return response;
  const headers = request.headers;
  if (headers.has("next-action") || headers.has("next-router-prefetch") ||
    headers.has("next-router-segment-prefetch") || headers.get("purpose") === "prefetch") return response;
  // Next's internal server-action redirect fetch removes the router state tree.
  if (headers.has("rsc") && !headers.has("next-router-state-tree")) return response;
  const secret = demoSigningSecret();
  if (!secret) return response;
  const now = Date.now();
  const visitor = await readDemoVisitor(request.cookies.get(DEMO_COOKIE)?.value, secret, now);
  if (!visitor?.expiresAt || visitor.expiresAt - now > DEMO_TTL_SECONDS * 1000 - leaseRenewalIntervalMs) return response;
  await setSignedDemoLease(response.cookies, visitor.id, secret, now, request.cookies.get(DEMO_KITS_COOKIE)?.value);
  return response;
}

/**
 * Keeps the Supabase session alive and routes signed-in visitors.
 *
 * Server Components cannot write cookies, so without this the access token expired after
 * about an hour and every page sent the user back to /signin. When a session cookie is present,
 * getUser() refreshes the token and the new cookies go out on the response (the
 * @supabase/ssr pattern). A signed-in visitor on / or /signin goes straight to /app.
 * Explicit local demo mode has no session to refresh.
 */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-jobsearch-settings");
  if (pathname === SETTINGS_PATH || pathname === "/app/agent" || pathname === "/app/settings/sourcing") {
    const section = pathname === "/app/agent" ? "assistant" : pathname === SETTINGS_PATH ? settingsSection(searchParams.get("section")) : "job-search";
    requestHeaders.set("x-jobsearch-settings", settingsHref(section));
  }
  const env = requireWorkspaceEnv();
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!env || !request.cookies.getAll().some(({ name }) => supabaseSessionCookie.test(name))) {
    return renewDemoVisit(request, response);
  }

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        const cookieHeader = request.headers.get("cookie");
        if (cookieHeader) requestHeaders.set("cookie", cookieHeader);
        else requestHeaders.delete("cookie");
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // Must run before anything else reads the session: it is what refreshes the token.
  const { data } = await supabase.auth.getUser();

  const to = signedInRedirect(request.nextUrl.pathname, Boolean(data.user));
  if (!to) return renewDemoVisit(request, response);
  const redirect = NextResponse.redirect(new URL(to, request.url));
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  // Everything except static assets and images, and the MCP endpoint (token auth, no session to refresh).
  matcher: ["/((?!api/mcp|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
