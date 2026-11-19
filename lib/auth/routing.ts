/**
 * Where a request should go given whether its visitor is signed in. Pure, so the
 * middleware's one routing decision is unit-tested: a signed-in visitor never sees the
 * landing or sign-in page again - they go straight to the overview, the page that says
 * what to do next (docs/DESIGN.md: Overview, Pipeline, Interview).
 */
export const APP_HOME = "/app/home";

const SIGNED_OUT_ONLY = new Set(["/", "/signin"]);

export function signedInRedirect(pathname: string, signedIn: boolean): string | null {
  return signedIn && SIGNED_OUT_ONLY.has(pathname) ? APP_HOME : null;
}
