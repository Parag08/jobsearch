/**
 * Where a request should go given whether its visitor is signed in. Pure, so the
 * middleware's one routing decision is unit-tested: a signed-in visitor never sees the
 * landing or sign-in page again - they go straight to their dashboard.
 */
const SIGNED_OUT_ONLY = new Set(["/", "/signin"]);

export function signedInRedirect(pathname: string, signedIn: boolean): string | null {
  return signedIn && SIGNED_OUT_ONLY.has(pathname) ? "/app" : null;
}
