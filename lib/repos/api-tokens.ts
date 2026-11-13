import { many, one, type DbClient } from "./db";
import type { ApiTokenRow } from "./rows";

/** A personal agent token as its owner sees it. The token itself is never stored or returned. */
export interface ApiToken {
  id: string;
  name: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function toApiToken(r: ApiTokenRow): ApiToken {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at ?? null,
    lastUsedAt: r.last_used_at ?? null,
    revokedAt: r.revoked_at ?? null,
  };
}

export async function insertApiToken(db: DbClient, userId: string, name: string, tokenHash: string): Promise<ApiToken> {
  const row = await one(
    db.from("api_tokens").insert({ user_id: userId, name, token_hash: tokenHash }).select().single(),
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

/**
 * Resolve a token hash to its owner. Called with the secret-key client (the caller has
 * no session), so this is the one lookup that is NOT scoped by user_id - the hash is
 * the credential. Revoked tokens resolve to null. Stamps last_used_at.
 */
export async function resolveApiToken(db: DbClient, tokenHash: string, nowIso: string): Promise<string | null> {
  const rows = await many(db.from("api_tokens").select().eq("token_hash", tokenHash).limit(1), "api_tokens", "resolve");
  const row = rows[0];
  if (!row || row.revoked_at) return null;
  await db.from("api_tokens").update({ last_used_at: nowIso }).eq("id", row.id);
  return row.user_id;
}
