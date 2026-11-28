import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { LIST_LIMIT } from "../repos/db";
import { insertApiToken, listApiTokens, resolveApiToken, revokeApiToken } from "../repos/api-tokens";
import { bearerToken, generateToken, hashToken, isExpired, tokenExpiry, tokenOptions, TOKEN_PREFIX } from "./token";

describe("agent tokens", () => {
  it("generates distinct prefixed tokens and a stable hash that is not the token", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a.slice(TOKEN_PREFIX.length));
  });

  it("reads only a well-formed bearer header carrying one of our tokens", () => {
    expect(bearerToken("Bearer jsk_abc")).toBe("jsk_abc");
    expect(bearerToken("bearer jsk_abc")).toBe("jsk_abc");
    expect(bearerToken("Bearer something-else")).toBeNull();
    expect(bearerToken("jsk_abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  const opts = { scope: "write" as const, days: 365 };

  it("lists older keys so their owners can still revoke them", async () => {
    const db = new FakeDb();
    const key = await insertApiToken(db, "user-1", "old key", hashToken(generateToken()), opts);
    await db.from("api_tokens").insert(Array.from({ length: LIST_LIMIT }, (_, i) => ({
      user_id: "user-1", name: `recent key ${i}`, created_at: "2099-01-01T00:00:00Z",
    })));
    expect((await listApiTokens(db, "user-1")).at(-1)).toEqual(key);
  });

  it("resolves a stored hash to its owner and scope, stamps last use, and stops after revocation", async () => {
    const db = new FakeDb();
    const token = generateToken();
    const created = await insertApiToken(db, "user-1", "laptop", hashToken(token), opts);

    expect(await resolveApiToken(db, hashToken(token), "2026-11-13T01:00:00Z")).toEqual({ ok: true, userId: "user-1", scope: "write" });
    expect(await resolveApiToken(db, hashToken("jsk_wrong"), "2026-11-13T01:00:00Z")).toEqual({ ok: false, reason: "invalid" });
    expect((await listApiTokens(db, "user-1"))[0].lastUsedAt).toBe("2026-11-13T01:00:00Z");
    expect(await listApiTokens(db, "user-2")).toEqual([]);

    await revokeApiToken(db, "user-1", created.id, "2026-11-13T02:00:00Z");
    expect(await resolveApiToken(db, hashToken(token), "2026-11-13T03:00:00Z")).toEqual({ ok: false, reason: "invalid" });
  });

  it("keeps a read-only scope and refuses a token once it has expired", async () => {
    const db = new FakeDb();
    const token = generateToken();
    const made = await insertApiToken(db, "user-1", "reader", hashToken(token), { scope: "read", days: 30 });
    expect(made.scope).toBe("read");
    expect(Date.parse(made.expiresAt!) - Date.parse(made.createdAt!)).toBe(30 * 24 * 60 * 60 * 1000);
    db.patchRows("api_tokens", { id: made.id }, { expires_at: "2026-12-01T00:00:00.000Z" });
    expect(await resolveApiToken(db, hashToken(token), "2026-11-30T23:59:59.000Z")).toEqual({ ok: true, userId: "user-1", scope: "read" });
    expect(await resolveApiToken(db, hashToken(token), "2026-12-01T00:00:00.000Z")).toEqual({ ok: false, reason: "expired" });
  });

  it("makes tokens only with an allowed lifetime and a well-formed hash, starting a fresh window", async () => {
    const db = new FakeDb();
    const hash = hashToken(generateToken());
    await expect(insertApiToken(db, "user-1", "x", hash, { scope: "write", days: 36500 })).rejects.toThrow("api_tokens.insert");
    await expect(insertApiToken(db, "user-1", "x", "chosen", { scope: "write", days: 90 })).rejects.toThrow("api_tokens.insert");
    await expect(insertApiToken(db, "user-1", "", hash, { scope: "write", days: 90 })).rejects.toThrow("api_tokens.insert");
    await insertApiToken(db, "user-1", "x", hash, { scope: "write", days: 90 });
    expect(db.rows("api_tokens")).toMatchObject([{ window_count: 0, window_start: null, revoked_at: null }]);
  });

  it("treats a row without an explicit write scope or expiry as read-only and expired", async () => {
    const db = new FakeDb();
    const token = generateToken();
    db.seed("api_tokens", [{ user_id: "user-1", name: "old", token_hash: hashToken(token) }]);
    expect(await resolveApiToken(db, hashToken(token), "2026-11-13T01:00:00Z")).toEqual({ ok: false, reason: "expired" });
  });

  it("rate-limits a token per window and lets it through again after the window", async () => {
    const db = new FakeDb();
    const token = generateToken();
    await insertApiToken(db, "user-1", "laptop", hashToken(token), opts);
    const limit = { requests: 2, windowMs: 60_000 };
    const at = (s: string) => resolveApiToken(db, hashToken(token), `2026-11-13T01:00:${s}.000Z`, limit);
    expect((await at("00")).ok).toBe(true);
    expect((await at("10")).ok).toBe(true);
    expect(await at("20")).toEqual({ ok: false, reason: "rate_limited", retryAfterSec: 40 });
    expect((await resolveApiToken(db, hashToken(token), "2026-11-13T01:01:00.000Z", limit)).ok).toBe(true);
  });

  it("counts overlapping requests on one token once each, so they cannot share the last slot", async () => {
    const db = new FakeDb();
    const token = generateToken();
    await insertApiToken(db, "user-1", "laptop", hashToken(token), opts);
    const limit = { requests: 2, windowMs: 60_000 };
    const now = "2026-11-13T01:00:00.000Z";
    const results = await Promise.all([1, 2, 3, 4].map(() => resolveApiToken(db, hashToken(token), now, limit)));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(db.rows("api_tokens")[0].window_count).toBe(2);
  });

  it("never stores the token itself", async () => {
    const db = new FakeDb();
    const token = generateToken();
    await insertApiToken(db, "user-1", "laptop", hashToken(token), opts);
    expect(JSON.stringify(db.rows("api_tokens"))).not.toContain(token);
  });

  it("reads scope and lifetime from the form, defaulting to write for 90 days, and computes expiry", () => {
    expect(tokenOptions("read", "30")).toEqual({ scope: "read", days: 30 });
    expect(tokenOptions("admin", "9999")).toEqual({ scope: "write", days: 90 });
    expect(tokenOptions(undefined, undefined)).toEqual({ scope: "write", days: 90 });
    expect(tokenExpiry("2026-11-19T00:00:00.000Z", 30)).toBe("2026-12-19T00:00:00.000Z");
    expect(isExpired("2026-11-19T00:00:00+00:00", "2026-11-18T23:59:59.000Z")).toBe(false);
    expect(isExpired("2026-11-19T00:00:00+00:00", "2026-11-19T00:00:00.000Z")).toBe(true);
    expect(isExpired(null, "2026-11-19T00:00:00.000Z")).toBe(true);
  });
});
