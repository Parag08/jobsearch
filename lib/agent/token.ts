import { createHash, randomBytes } from "node:crypto";

/** Prefix that marks a JobSearch agent token (so a leaked one is recognisable in a scan). */
export const TOKEN_PREFIX = "jsk_";

/** A new personal agent token: 32 random bytes, base64url. Shown to the user once. */
export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

/** What is stored and looked up. The token carries 256 bits of entropy, so a plain SHA-256 is enough. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** The token from an `Authorization: Bearer <token>` header, or null when absent or not ours. */
export function bearerToken(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return m && m[1].startsWith(TOKEN_PREFIX) ? m[1] : null;
}
