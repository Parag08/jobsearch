import { describe, it, expect } from "vitest";
import { planRetirement, RETIRE_AFTER_MISSES, type TrackedJob } from "./retire";

const job = (over: Partial<TrackedJob>): TrackedJob => ({
  id: "j",
  source: "greenhouse",
  externalId: "1",
  company: "Acme Corp",
  status: "new",
  missedRefreshes: 0,
  ...over,
});

const acme = { source: "greenhouse", company: "Acme Corp" };

describe("planRetirement", () => {
  it("retires only after RETIRE_AFTER_MISSES consecutive refreshes without the posting", () => {
    expect(RETIRE_AFTER_MISSES).toBe(2);
    const first = planRetirement([job({ id: "a" })], [], [acme]);
    expect(first).toEqual([{ id: "a", missedRefreshes: 1, status: "new" }]);
    const second = planRetirement([job({ id: "a", missedRefreshes: 1 })], [], [acme]);
    expect(second).toEqual([{ id: "a", missedRefreshes: 2, status: "closed" }]);
  });

  it("a posting seen again resets its miss count, and a closed one comes back as new", () => {
    const seen = [{ source: "greenhouse", externalId: "1" }];
    expect(planRetirement([job({ id: "a", missedRefreshes: 1 })], seen, [acme])).toEqual([
      { id: "a", missedRefreshes: 0, status: "new" },
    ]);
    expect(planRetirement([job({ id: "b", status: "closed", missedRefreshes: 2 })], seen, [acme])).toEqual([
      { id: "b", missedRefreshes: 0, status: "new" },
    ]);
  });

  it("never counts a miss for a board that did not answer (a failed fetch is not a closed role)", () => {
    expect(planRetirement([job({ id: "a" })], [], [])).toEqual([]);
  });

  it("matches boards by ATS and company name, ignoring case and spacing", () => {
    const other = job({ id: "o", company: "Beta Labs" });
    const sameCo = job({ id: "s", company: "  acme  corp " });
    expect(planRetirement([other, sameCo], [], [acme])).toEqual([{ id: "s", missedRefreshes: 1, status: "new" }]);
  });

  it("leaves tracked and dismissed rows alone: those are the user's decisions", () => {
    const rows = [job({ id: "t", status: "tracked" }), job({ id: "d", status: "dismissed" })];
    expect(planRetirement(rows, [], [acme])).toEqual([]);
  });

  it("keeps a shortlisted role's status until it retires, and emits nothing for an unchanged seen row", () => {
    expect(planRetirement([job({ id: "s", status: "shortlisted" })], [], [acme])).toEqual([
      { id: "s", missedRefreshes: 1, status: "shortlisted" },
    ]);
    const seen = [{ source: "greenhouse", externalId: "1" }];
    expect(planRetirement([job({ id: "s", status: "shortlisted" })], seen, [acme])).toEqual([]);
  });

  it("ignores rows from other feeds (adzuna) and rows without an external id", () => {
    const rows = [job({ id: "z", source: "adzuna" }), job({ id: "n", externalId: null })];
    expect(planRetirement(rows, [], [acme])).toEqual([]);
  });
});
