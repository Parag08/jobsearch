import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, DEMO_KITS_COOKIE, demoMaxVisitorsFromEnv, newVisitorId } from "@/lib/demo/visitors";
import { demoCookieOptions, demoSigningSecret, readDemoVisitor, setSignedDemoLease } from "@/lib/demo/visitor-token";
import { MintThrottle, clientAddress } from "@/lib/demo/mint-throttle";

const holder = globalThis as { __jobsearchDemoMints?: MintThrottle };

/**
 * GET /demo - start (or resume) the public demo: a cookie with a random visitor id, then the
 * Overview. The visitor gets their own copy of a fictional workspace (lib/db/demo.ts), and
 * every AI feature answers from lib/demo/canned.ts, so a visit costs no tokens.
 * Off when DEMO_MAX_VISITORS is unset: the landing page then sends people to sign in.
 * Starting a new visit is throttled per client address (lib/demo/mint-throttle.ts).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!demoMaxVisitorsFromEnv(process.env)) return NextResponse.redirect(new URL("/signin", req.url));
  const secret = demoSigningSecret();
  const now = Date.now();
  const existing = await readDemoVisitor(req.cookies.get(DEMO_COOKIE)?.value, secret, now);
  if (!existing) {
    const { allowed, retryAfterSec } = (holder.__jobsearchDemoMints ??= new MintThrottle()).take(clientAddress(req.headers), now);
    if (!allowed) {
      return new NextResponse("Too many new demo visits from this address. Try again in a few minutes.", {
        status: 429, headers: { "retry-after": String(retryAfterSec), "cache-control": "no-store" },
      });
    }
  }
  const id = existing?.id ?? newVisitorId();
  const res = NextResponse.redirect(new URL("/app/home", req.url));
  if (!existing) res.cookies.delete(DEMO_KITS_COOKIE);
  if (secret) {
    await setSignedDemoLease(res.cookies, id, secret, now, existing ? req.cookies.get(DEMO_KITS_COOKIE)?.value : undefined);
  } else {
    res.cookies.set(DEMO_COOKIE, id, demoCookieOptions(null));
  }
  return res;
}
