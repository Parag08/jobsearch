import { describe, it, expect } from "vitest";
import { nudgeQueue, type NudgeBank } from "./nudges";

const full: NudgeBank = {
  targets: 1,
  workAuthorisation: true,
  languages: true,
  summary: true,
  roles: [
    { id: "r1", points: 3, recent: true },
    { id: "r2", points: 4, recent: false },
  ],
  bullets: [
    { id: "b1", needsMetric: false },
    { id: "b2", needsMetric: false },
  ],
};

describe("nudgeQueue", () => {
  it("is empty when nothing was deferred", () => {
    expect(nudgeQueue(full)).toEqual([]);
  });

  it("orders: target, work authorisation, languages, thin recent roles, metrics, thin older roles, summary", () => {
    const q = nudgeQueue({
      targets: 0,
      workAuthorisation: false,
      languages: false,
      summary: false,
      roles: [
        { id: "old", points: 1, recent: false },
        { id: "new", points: 2, recent: true },
      ],
      bullets: [{ id: "b1", needsMetric: true }],
    });
    expect(q.map((n) => [n.kind, n.ref])).toEqual([
      ["missing-target", null],
      ["missing-work-authorisation", null],
      ["missing-languages", null],
      ["thin-role", "new"],
      ["needs-metric", "b1"],
      ["thin-role", "old"],
      ["missing-summary", null],
    ]);
    expect(q.map((n) => n.priority)).toEqual([...q.map((n) => n.priority)].sort((a, b) => a - b));
  });

  it("keeps input order within a kind and is deterministic across calls", () => {
    const bank: NudgeBank = {
      ...full,
      bullets: [
        { id: "z", needsMetric: true },
        { id: "a", needsMetric: true },
        { id: "m", needsMetric: false },
      ],
    };
    const a = nudgeQueue(bank);
    expect(a.map((n) => n.ref)).toEqual(["z", "a"]);
    expect(nudgeQueue(bank)).toEqual(a);
  });

  it("does not nudge a role that already has three points", () => {
    const q = nudgeQueue({ ...full, roles: [{ id: "r1", points: 3, recent: true }, { id: "r2", points: 2, recent: true }] });
    expect(q).toEqual([{ kind: "thin-role", ref: "r2", priority: expect.any(Number) }]);
  });
});
