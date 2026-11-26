import { DEMO_TTL_SECONDS, isVisitorId } from "./visitors";

const utf8 = new TextEncoder();
const ttlMs = DEMO_TTL_SECONDS * 1000;
export const demoMacMessage = (purpose: "visitor" | "kits", value: string) => "jobsearch/demo/" + purpose + "/v1:" + value;

export function demoSigningSecret(env = process.env): string | undefined {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY || undefined;
}

async function visitorMac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", utf8.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const message = utf8.encode(demoMacMessage("visitor", value));
  return {
    async sign() {
      const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
      return btoa(String.fromCharCode(...signature)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    async verify(signature: string) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
      const bytes = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/") + "="), (c) => c.charCodeAt(0));
      return crypto.subtle.verify("HMAC", key, bytes, message);
    },
  };
}

export async function demoVisitorToken(id: string, secret: string, now = Date.now()): Promise<string> {
  const value = id + "." + (now + ttlMs);
  return value + "." + await (await visitorMac(secret, value)).sign();
}

export function parseDemoVisitor(token: string | undefined, signed: boolean, now = Date.now()) {
  if (!token || token.length > 100) return null;
  if (!signed) return isVisitorId(token) ? { id: token, expiresAt: null } : null;
  const [id, expires, signature, extra] = token.split(".");
  if (!id || !isVisitorId(id) || !expires || !signature || extra !== undefined) return null;
  const expiresAt = Number(expires);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + ttlMs) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  return { id, expiresAt, value: id + "." + expires, signature };
}

export async function readDemoVisitor(token: string | undefined, secret: string | undefined, now = Date.now()) {
  const visitor = parseDemoVisitor(token, Boolean(secret), now);
  if (!visitor) return null;
  const { id, expiresAt } = visitor;
  if (expiresAt !== null && (!secret || !await (await visitorMac(secret, visitor.value)).verify(visitor.signature))) return null;
  return { id, expiresAt };
}

export function demoCookieOptions() {
  return { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" } as const;
}
