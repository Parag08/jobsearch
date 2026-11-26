import { createHmac, timingSafeEqual } from "node:crypto";
import { demoMacMessage, parseDemoVisitor } from "./visitor-token";

function digest(secret: string, purpose: "visitor" | "kits", value: string) {
  return createHmac("sha256", secret).update(demoMacMessage(purpose, value)).digest();
}

export function signDemoMac(secret: string, purpose: "kits", value: string) {
  return digest(secret, purpose, value).toString("base64url");
}

export function verifyDemoMac(secret: string, purpose: "visitor" | "kits", value: string, signature: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  return timingSafeEqual(digest(secret, purpose, value), Buffer.from(signature, "base64url"));
}

export function readNodeDemoVisitor(token: string | undefined, secret: string | undefined) {
  const visitor = parseDemoVisitor(token, Boolean(secret));
  if (!visitor) return null;
  const { id, expiresAt } = visitor;
  if (expiresAt !== null && (!secret || !verifyDemoMac(secret, "visitor", visitor.value, visitor.signature))) return null;
  return { id, expiresAt };
}
