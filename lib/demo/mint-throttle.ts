import { takeRequest, type RateWindow } from "../agent/rate-limit";

/** How many new demo visitor ids one client address may start per window (GET /demo). */
export const DEMO_MINT_LIMIT = { requests: 10, windowMs: 10 * 60_000 } as const;

/** DEMO_MINTS_PER_WINDOW (.env.example) overrides the per-address count; unset = DEMO_MINT_LIMIT. */
export function demoMintLimitFromEnv(env: Record<string, string | undefined>): { requests: number; windowMs: number } {
  const raw = env.DEMO_MINTS_PER_WINDOW;
  if (!raw) return DEMO_MINT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`DEMO_MINTS_PER_WINDOW must be a whole number >= 1, got "${raw}"`);
  return { requests: n, windowMs: DEMO_MINT_LIMIT.windowMs };
}

const holder = globalThis as { __jobsearchDemoMints?: MintThrottle };

/** The process-wide throttle, shared by /demo and workspace resolution (lib/db/index.ts). */
export function demoMintThrottle(env: Record<string, string | undefined> = process.env): MintThrottle {
  return (holder.__jobsearchDemoMints ??= new MintThrottle(demoMintLimitFromEnv(env)));
}

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
