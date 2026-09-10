import { describe, it, expect } from "vitest";
import { readiness, proudestThree, TOP_STRENGTH, DEFAULT_STRENGTH } from "./readiness";

describe("readiness", () => {
  it("scores the minimum viable bank at 100 with nothing missing", () => {
    const r = readiness({
      identity: true,
      education: true,
      roles: [
        { points: 3, recent: true },
        { points: 3, recent: true },
        { points: 3, recent: true },
      ],
      targets: 1,
    });
    expect(r).toEqual({ score: 100, missing: [] });
  });

  it("scores an empty bank at 0 and names everything missing", () => {
    const r = readiness({ identity: false, education: false, roles: [], targets: 0 });
    expect(r.score).toBe(0);
    expect(r.missing).toEqual(["identity", "education", "target", "recent roles (0 of 2)", "points (0 of 9)"]);
  });

  it("a target is worth more than education: nothing renders without one", () => {
    const base = { identity: true, roles: [{ points: 3, recent: true }, { points: 3, recent: true }, { points: 3, recent: true }] };
    const noTarget = readiness({ ...base, education: true, targets: 0 }).score;
    const noEdu = readiness({ ...base, education: false, targets: 1 }).score;
    expect(noTarget).toBeLessThan(noEdu);
  });

  it("only recent roles count toward roles and points; thin recent roles are named", () => {
    const r = readiness({
      identity: true,
      education: true,
      roles: [
        { points: 1, recent: true },
        { points: 6, recent: false },
      ],
      targets: 1,
    });
    expect(r.missing).toEqual(["recent roles (1 of 2)", "recent role 1 needs 2 more points", "points (1 of 9)"]);
    expect(r.score).toBeGreaterThan(40);
    expect(r.score).toBeLessThan(60);
  });

  it("is monotonic in points and never exceeds 100", () => {
    const mk = (p: number) =>
      readiness({ identity: true, education: true, roles: [{ points: p, recent: true }, { points: p, recent: true }], targets: 2 }).score;
    expect(mk(1)).toBeLessThan(mk(3));
    expect(mk(3)).toBeLessThan(mk(5));
    expect(mk(50)).toBe(100);
  });
});

describe("proudestThree", () => {
  const ids = ["b1", "b2", "b3", "b4", "b5"];

  it("gives the chosen three top strength and everyone else the default", () => {
    expect(proudestThree(ids, ["b2", "b4", "b5"])).toEqual({
      b1: DEFAULT_STRENGTH,
      b2: TOP_STRENGTH,
      b3: DEFAULT_STRENGTH,
      b4: TOP_STRENGTH,
      b5: TOP_STRENGTH,
    });
    expect(TOP_STRENGTH).toBe(5);
    expect(DEFAULT_STRENGTH).toBe(3);
  });

  it("accepts fewer than three (the user may only have one they are proud of)", () => {
    expect(proudestThree(ids, ["b1"]).b1).toBe(TOP_STRENGTH);
  });

  it("rejects more than three", () => {
    expect(() => proudestThree(ids, ["b1", "b2", "b3", "b4"])).toThrow(RangeError);
  });

  it("rejects a chosen id that is not in the bank", () => {
    expect(() => proudestThree(ids, ["nope"])).toThrow(/nope/);
  });

  it("ignores duplicate choices", () => {
    expect(proudestThree(ids, ["b1", "b1", "b1", "b1"]).b1).toBe(TOP_STRENGTH);
  });
});
