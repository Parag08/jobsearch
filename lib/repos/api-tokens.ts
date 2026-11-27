import { many, one, type DbClient } from "./db";
import type { ApiTokenRow } from "./rows";
import { isExpired, type TokenScope } from "../agent/token";
import { RATE_LIMIT, takeRequest } from "../agent/rate-limit";

/** A personal agent token as its owner sees it. The token itself is never stored or returned. */
export interface ApiToken {
  id: string;
  name: string;
  scope: TokenScope;
  createdAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** Anything but an explicit write grant is read-only. */
const scopeOf = (r: ApiTokenRow): TokenScope => (r.scope === "write" ? "write" : "read");

function toApiToken(r: ApiTokenRow): ApiToken {
  return {
    id: r.id,
    name: r.name,
    scope: scopeOf(r),
    createdAt: r.created_at ?? null,
    expiresAt: r.expires_at ?? null,
    lastUsedAt: r.last_used_at ?? null,
    revokedAt: r.revoked_at ?? null,
  };
}

/**
 * Make a token through create_api_token (migration 0024). The owner cannot write api_tokens
 * directly: the database sets the expiry from the lifetime and starts the rate-limit window.
 */
export async function insertApiToken(
  db: DbClient,
  userId: string,
  name: string,
  tokenHash: string,
  opts: { scope: TokenScope; days: number },
): Promise<ApiToken> {
  const row = await one(
    db.rpc("create_api_token", { p_user_id: userId, p_name: name, p_token_hash: tokenHash, p_scope: opts.scope, p_days: opts.days }),
    "api_tokens",
    "insert",
  );
  return toApiToken(row);
}

export async function listApiTokens(db: DbClient, userId: string): Promise<ApiToken[]> {
  const rows = await many(
    db.from("api_tokens").select().eq("user_id", userId).order("created_at", { ascending: false }),
    "api_tokens",
    "list",
  );
  return rows.map(toApiToken);
}

export async function revokeApiToken(db: DbClient, userId: string, id: string, nowIso: string): Promise<void> {
  await one(
    db.from("api_tokens").update({ revoked_at: nowIso }).eq("user_id", userId).eq("id", id).select().single(),
    "api_tokens",
    "revoke",
  );
}

export type ResolvedToken =
  | { ok: true; userId: string; scope: TokenScope }
  | { ok: false; reason: "invalid" | "expired" }
  | { ok: false; reason: "rate_limited"; retryAfterSec: number };

/**
 * Resolve a token hash to its owner and scope. Called with the secret-key client (the
 * caller has no session), so this is the one lookup that is NOT scoped by user_id - the
 * hash is the credential. Revoked and expired tokens resolve to nothing; a token over its
 * rate limit is refused until its window resets. Stamps last_used_at and the window.
 */
/**
 * The owner and scope behind a token hash, once it passes revocation, expiry and the rate
 * limit. The count is claimed with a compare-and-set on `window_count`, so overlapping
 * requests on one token cannot both take the last slot; a request that loses the race re-reads.
 */
export async function resolveApiToken(
  db: DbClient,
  tokenHash: string,
  nowIso: string,
  limit: { requests: number; windowMs: number } = RATE_LIMIT,
): Promise<ResolvedToken> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = await many(db.from("api_tokens").select().eq("token_hash", tokenHash).limit(1), "api_tokens", "resolve");
    const row = rows[0];
    if (!row || row.revoked_at) return { ok: false, reason: "invalid" };
    if (isExpired(row.expires_at, nowIso)) return { ok: false, reason: "expired" };

    const count = row.window_count ?? 0;
    const rate = takeRequest({ windowStart: row.window_start ?? null, count }, nowIso, limit);
    if (!rate.allowed) return { ok: false, reason: "rate_limited", retryAfterSec: rate.retryAfterSec };
    const claimed = await many(
      db
        .from("api_tokens")
        .update({ last_used_at: nowIso, window_start: rate.next.windowStart, window_count: rate.next.count })
        .eq("id", row.id)
        .eq("window_count", count)
        .select(),
      "api_tokens",
      "claim",
    );
    if (claimed.length) return { ok: true, userId: row.user_id, scope: scopeOf(row) };
  }
  return { ok: false, reason: "rate_limited", retryAfterSec: 1 };
}
