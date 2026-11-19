import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, DEMO_TTL_SECONDS, demoMaxVisitorsFromEnv, isVisitorId, newVisitorId } from "@/lib/demo/visitors";

/**
 * GET /demo - start (or resume) the public demo: a cookie with a random visitor id, then the
 * Overview. The visitor gets their own copy of a fictional workspace (lib/db/demo.ts), and
 * every AI feature answers from lib/demo/canned.ts, so a visit costs no tokens.
 * Off when DEMO_MAX_VISITORS is unset: the landing page then sends people to sign in.
 */
export function GET(req: NextRequest): NextResponse {
  if (!demoMaxVisitorsFromEnv(process.env)) return NextResponse.redirect(new URL("/signin", req.url));
  const existing = req.cookies.get(DEMO_COOKIE)?.value;
  const id = existing && isVisitorId(existing) ? existing : newVisitorId();
  const res = NextResponse.redirect(new URL("/app/home", req.url));
  res.cookies.set(DEMO_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEMO_TTL_SECONDS,
  });
  return res;
}
