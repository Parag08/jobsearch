import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, DEMO_KITS_COOKIE, DEMO_TTL_SECONDS, demoMaxVisitorsFromEnv, newVisitorId } from "@/lib/demo/visitors";
import { demoCookieOptions, demoSigningSecret, demoVisitorToken, readDemoVisitor } from "@/lib/demo/visitor-token";

/**
 * GET /demo - start (or resume) the public demo: a cookie with a random visitor id, then the
 * Overview. The visitor gets their own copy of a fictional workspace (lib/db/demo.ts), and
 * every AI feature answers from lib/demo/canned.ts, so a visit costs no tokens.
 * Off when DEMO_MAX_VISITORS is unset: the landing page then sends people to sign in.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!demoMaxVisitorsFromEnv(process.env)) return NextResponse.redirect(new URL("/signin", req.url));
  const secret = demoSigningSecret();
  const existing = await readDemoVisitor(req.cookies.get(DEMO_COOKIE)?.value, secret);
  const id = existing?.id ?? newVisitorId();
  const res = NextResponse.redirect(new URL("/app/home", req.url));
  if (!existing) res.cookies.delete(DEMO_KITS_COOKIE);
  res.cookies.set(DEMO_COOKIE, secret ? await demoVisitorToken(id, secret) : id,
    { ...demoCookieOptions(), maxAge: DEMO_TTL_SECONDS });
  return res;
}
