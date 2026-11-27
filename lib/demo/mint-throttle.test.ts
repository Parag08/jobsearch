import { describe, it, expect } from "vitest";
import { MintThrottle, clientAddress } from "./mint-throttle";

describe("MintThrottle", () => {
  it("refuses new ids from one address past the limit, until the window resets", () => {
    const throttle = new MintThrottle({ requests: 2, windowMs: 60_000 });
    expect(throttle.take("1.2.3.4", 0).allowed).toBe(true);
    expect(throttle.take("1.2.3.4", 1).allowed).toBe(true);
    expect(throttle.take("1.2.3.4", 2)).toEqual({ allowed: false, retryAfterSec: 60 });
    expect(throttle.take("5.6.7.8", 3).allowed).toBe(true);
    expect(throttle.take("1.2.3.4", 60_000).allowed).toBe(true);
  });

  it("keeps a bounded number of addresses", () => {
    const throttle = new MintThrottle({ requests: 1, windowMs: 60_000 }, 3);
    for (let i = 0; i < 10; i++) throttle.take(`10.0.0.${i}`, i);
    expect(throttle.size).toBe(3);
  });
});

describe("clientAddress", () => {
  it("takes the first forwarded address, then x-real-ip", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientAddress(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
