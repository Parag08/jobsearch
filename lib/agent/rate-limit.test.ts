import { describe, it, expect } from "vitest";
import { takeRequest } from "./rate-limit";

const limit = { requests: 2, windowMs: 60_000 };

describe("per-token rate limit", () => {
  it("opens a window on first use and counts within it", () => {
    const a = takeRequest({ windowStart: null, count: 0 }, "2026-11-19T00:00:00.000Z", limit);
    expect(a).toEqual({ allowed: true, next: { windowStart: "2026-11-19T00:00:00.000Z", count: 1 }, retryAfterSec: 0 });
    const b = takeRequest(a.next, "2026-11-19T00:00:10.000Z", limit);
    expect(b.allowed).toBe(true);
    expect(b.next.count).toBe(2);
  });

  it("refuses past the limit with the seconds left, and resets after the window", () => {
    const full = { windowStart: "2026-11-19T00:00:00.000Z", count: 2 };
    const refused = takeRequest(full, "2026-11-19T00:00:45.000Z", limit);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSec).toBe(15);
    expect(refused.next).toEqual(full);
    const fresh = takeRequest(full, "2026-11-19T00:01:00.000Z", limit);
    expect(fresh).toEqual({ allowed: true, next: { windowStart: "2026-11-19T00:01:00.000Z", count: 1 }, retryAfterSec: 0 });
  });
});
