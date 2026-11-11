import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { makeNonce, readGoogleClientId, shouldOfferOneTap } from "./google-one-tap";

describe("readGoogleClientId", () => {
  it("returns the client ID from NEXT_PUBLIC_GOOGLE_CLIENT_ID", () => {
    expect(readGoogleClientId({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: "abc.apps.googleusercontent.com" })).toBe(
      "abc.apps.googleusercontent.com",
    );
  });

  it("trims whitespace a pasted value can carry", () => {
    expect(readGoogleClientId({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: "  abc.apps.googleusercontent.com\n" })).toBe(
      "abc.apps.googleusercontent.com",
    );
  });

  it("is null when unset or blank, so One Tap renders nothing", () => {
    expect(readGoogleClientId({})).toBeNull();
    expect(readGoogleClientId({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: "   " })).toBeNull();
  });
});

describe("shouldOfferOneTap", () => {
  it("needs both a client ID and Supabase", () => {
    expect(shouldOfferOneTap({ clientId: "id", supabaseConfigured: true })).toBe(true);
    expect(shouldOfferOneTap({ clientId: null, supabaseConfigured: true })).toBe(false);
    expect(shouldOfferOneTap({ clientId: "id", supabaseConfigured: false })).toBe(false);
  });
});

describe("makeNonce", () => {
  it("gives Google the SHA-256 hex of the raw nonce Supabase receives", async () => {
    const { raw, hashed } = await makeNonce();
    expect(raw.length).toBeGreaterThanOrEqual(32);
    expect(hashed).toBe(createHash("sha256").update(raw).digest("hex"));
  });

  it("is fresh every call", async () => {
    const a = await makeNonce();
    const b = await makeNonce();
    expect(a.raw).not.toBe(b.raw);
  });
});
