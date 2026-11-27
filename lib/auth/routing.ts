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

/**
 * The `next` page to land on after sign-in, accepted only when it is a path on this
 * site: a single leading slash, no backslash or control character (browsers treat
 * `/\host` and `/\t/host` as `//host`), resolving to the same origin, and not
 * normalizing to `//host` (`/.//host`).
 * Anything else falls back to the overview, so the callback never redirects off-site.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return APP_HOME;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return APP_HOME;
  const base = "http://same-origin.invalid";
  try {
    const url = new URL(next, base);
    if (url.origin !== base || url.pathname.startsWith("//")) return APP_HOME;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return APP_HOME;
  }
}
