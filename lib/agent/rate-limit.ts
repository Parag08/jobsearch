/**
 * A per-token fixed window, kept on the api_tokens row so it holds across serverless
 * instances. Pure: the repo reads the window, asks here, and writes `next` back.
 */
export const RATE_LIMIT = { requests: 60, windowMs: 60_000 } as const;

export interface RateWindow {
  windowStart: string | null;
  count: number;
}

export interface RateDecision {
  allowed: boolean;
  next: { windowStart: string; count: number };
  /** Seconds until the window resets; 0 when allowed. */
  retryAfterSec: number;
}

export function takeRequest(w: RateWindow, nowIso: string, limit: { requests: number; windowMs: number } = RATE_LIMIT): RateDecision {
  const now = Date.parse(nowIso);
  const start = w.windowStart ? Date.parse(w.windowStart) : NaN;
  if (!Number.isFinite(start) || now - start >= limit.windowMs || now < start) {
    return { allowed: true, next: { windowStart: nowIso, count: 1 }, retryAfterSec: 0 };
  }
  if (w.count >= limit.requests) {
    return {
      allowed: false,
      next: { windowStart: w.windowStart!, count: w.count },
      retryAfterSec: Math.max(1, Math.ceil((start + limit.windowMs - now) / 1000)),
    };
  }
  return { allowed: true, next: { windowStart: w.windowStart!, count: w.count + 1 }, retryAfterSec: 0 };
}
