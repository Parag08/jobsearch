/**
 * Google One Tap helpers (pure; Web Crypto only, so they run in the browser and in Node).
 * The client ID comes from env - never hardcode it (CLAUDE.md: config only via .env).
 */

/** NEXT_PUBLIC_GOOGLE_CLIENT_ID, trimmed; null when unset, so One Tap renders nothing. */
export function readGoogleClientId(env: Record<string, string | undefined> = process.env): string | null {
  const id = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  return id ? id : null;
}

/** One Tap hands its ID token to Supabase, so it needs both pieces configured. */
export function shouldOfferOneTap(input: { clientId: string | null; supabaseConfigured: boolean }): boolean {
  return input.clientId !== null && input.supabaseConfigured;
}

/**
 * Supabase's documented nonce dance: Google receives the SHA-256 hex of the nonce
 * (it is embedded in the ID token), Supabase receives the raw nonce and checks the hash.
 */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { raw, hashed };
}
