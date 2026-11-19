/** Token scope and lifetime rules. No node imports: the token form (a client component) reads these. */

/** What a token may do: `read` sees only the read-only tools; `write` sees every tool. */
export const TOKEN_SCOPES = ["read", "write"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** Lifetimes offered on /app/agent. Every token expires; a lost one stops working on its own. */
export const TOKEN_LIFETIME_DAYS = [30, 90, 365] as const;
export const DEFAULT_TOKEN_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The scope and lifetime asked for on the form, falling back to write / 90 days for anything else. */
export function tokenOptions(scope: unknown, days: unknown): { scope: TokenScope; days: number } {
  const d = Number(days);
  return {
    scope: scope === "read" ? "read" : "write",
    days: (TOKEN_LIFETIME_DAYS as readonly number[]).includes(d) ? d : DEFAULT_TOKEN_DAYS,
  };
}

export function tokenExpiry(nowIso: string, days: number): string {
  return new Date(Date.parse(nowIso) + days * DAY_MS).toISOString();
}

/** True once the token's expiry has passed (or it has none, which the schema does not allow). */
export function isExpired(expiresAt: string | null | undefined, nowIso: string): boolean {
  const t = expiresAt ? Date.parse(expiresAt) : NaN;
  return !Number.isFinite(t) || t <= Date.parse(nowIso);
}
