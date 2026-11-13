import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { insertApiToken, listApiTokens, resolveApiToken, revokeApiToken } from "../repos/api-tokens";
import { bearerToken, generateToken, hashToken, TOKEN_PREFIX } from "./token";

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

  it("resolves a stored hash to its owner, stamps last use, and stops after revocation", async () => {
    const db = new FakeDb();
    const token = generateToken();
    const created = await insertApiToken(db, "user-1", "laptop", hashToken(token));

    expect(await resolveApiToken(db, hashToken(token), "2026-11-13T01:00:00Z")).toBe("user-1");
    expect(await resolveApiToken(db, hashToken("jsk_wrong"), "2026-11-13T01:00:00Z")).toBeNull();
    expect((await listApiTokens(db, "user-1"))[0].lastUsedAt).toBe("2026-11-13T01:00:00Z");
    expect(await listApiTokens(db, "user-2")).toEqual([]);

    await revokeApiToken(db, "user-1", created.id, "2026-11-13T02:00:00Z");
    expect(await resolveApiToken(db, hashToken(token), "2026-11-13T03:00:00Z")).toBeNull();
  });

  it("never stores the token itself", async () => {
    const db = new FakeDb();
    const token = generateToken();
    await insertApiToken(db, "user-1", "laptop", hashToken(token));
    expect(JSON.stringify(db.rows("api_tokens"))).not.toContain(token);
  });
});
