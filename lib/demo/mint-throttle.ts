import { takeRequest, type RateWindow } from "../agent/rate-limit";

/** How many new demo visitor ids one client address may start per window (GET /demo). */
export const DEMO_MINT_LIMIT = { requests: 10, windowMs: 10 * 60_000 } as const;

/**
 * A per-address fixed window on minting demo visitor ids, in memory like the visitor store it
 * protects (lib/demo/visitors.ts): one client cannot churn ids to push every other visitor out.
 * Bounded: past `maxKeys` addresses, expired windows go first, then the oldest.
 */
export class MintThrottle {
  private windows = new Map<string, RateWindow>();

  constructor(
    private readonly limit: { requests: number; windowMs: number } = DEMO_MINT_LIMIT,
    private readonly maxKeys = 10_000,
  ) {}

  take(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
    const nowIso = new Date(now).toISOString();
    const decision = takeRequest(this.windows.get(key) ?? { windowStart: null, count: 0 }, nowIso, this.limit);
    this.windows.delete(key);
    if (this.windows.size >= this.maxKeys) {
      for (const [k, w] of this.windows) if (!w.windowStart || now - Date.parse(w.windowStart) >= this.limit.windowMs) this.windows.delete(k);
      while (this.windows.size >= this.maxKeys) this.windows.delete(this.windows.keys().next().value as string);
    }
    this.windows.set(key, decision.next);
    return { allowed: decision.allowed, retryAfterSec: decision.retryAfterSec };
  }

  get size(): number {
    return this.windows.size;
  }
}

/** The client address the platform reports (Vercel sets both headers itself). */
export function clientAddress(headers: Pick<Headers, "get">): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
}
