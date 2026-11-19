import { describe, it, expect } from "vitest";
import { momentum, type MomentumInput } from "./momentum";

const TODAY = "2026-11-19";
const base: MomentumInput = {
  today: TODAY,
  applications: [],
  outreachDates: [],
  practice: [],
  openRoles: 0,
  followupsDue: 0,
  stale: 0,
};
const app = (stage: string, savedAt: string, appliedAt: string | null = null, id = `${stage}-${savedAt}`) => ({
  id,
  company: "Acme",
  stage,
  savedAt,
  appliedAt,
});

describe("momentum: this week", () => {
  it("counts applications, outreach and practice in the last 7 days, today included", () => {
    const m = momentum({
      ...base,
      applications: [app("applied", "2026-11-01", "2026-11-19"), app("applied", "2026-11-01", "2026-11-13"), app("applied", "2026-11-01", "2026-11-12")],
      outreachDates: ["2026-11-18", "2026-11-10"],
      practice: [{ date: "2026-11-19", seconds: 60 }, { date: "2026-11-19", seconds: 60 }, { date: "2026-11-14", seconds: 60 }],
    });
    expect(m.week).toEqual({ applied: 2, reachedOut: 1, practised: 3 });
  });

  it("goals come only from the caller; without one there is no target", () => {
    const m = momentum({ ...base, goals: { apply: 5 } });
    expect(m.goals).toEqual([{ key: "apply", done: 0, goal: 5 }]);
    expect(momentum(base).goals).toEqual([]);
  });
});

describe("momentum: streak and the last 14 days", () => {
  it("counts consecutive active days ending today", () => {
    const m = momentum({ ...base, practice: [{ date: "2026-11-19", seconds: 60 }, { date: "2026-11-18", seconds: 60 }, { date: "2026-11-17", seconds: 60 }, { date: "2026-11-15", seconds: 60 }] });
    expect(m.streak).toBe(3);
  });

  it("a streak survives until the end of today: yesterday's run still counts", () => {
    const m = momentum({ ...base, outreachDates: ["2026-11-18", "2026-11-17"] });
    expect(m.streak).toBe(2);
  });

  it("saving a job counts as activity", () => {
    expect(momentum({ ...base, applications: [app("saved", "2026-11-19")] }).streak).toBe(1);
  });

  it("returns 14 days oldest first with an activity count each", () => {
    const m = momentum({ ...base, practice: [{ date: "2026-11-19", seconds: 60 }, { date: "2026-11-19", seconds: 60 }, { date: "2026-11-06", seconds: 60 }] });
    expect(m.days).toHaveLength(14);
    expect(m.days[0]).toEqual({ date: "2026-11-06", count: 1 });
    expect(m.days[13]).toEqual({ date: "2026-11-19", count: 2 });
  });
});

describe("momentum: the message", () => {
  it("an empty workspace gets an invitation, not praise", () => {
    expect(momentum(base).mood).toBe("start");
  });

  it("an offer outranks everything", () => {
    expect(momentum({ ...base, applications: [app("offer", "2026-10-01", "2026-10-02")] }).mood).toBe("offer");
  });

  it("interviews in play come next", () => {
    expect(momentum({ ...base, applications: [app("interview", "2026-10-01", "2026-10-02")] }).mood).toBe("interviews");
  });

  it("a goal met this week is celebrated", () => {
    const m = momentum({ ...base, goals: { apply: 1 }, applications: [app("applied", "2026-11-01", "2026-11-18")] });
    expect(m.mood).toBe("goal-met");
  });

  it("a run of three days or more is named", () => {
    expect(momentum({ ...base, applications: [app("saved", "2026-11-01")], practice: [{ date: "2026-11-19", seconds: 60 }, { date: "2026-11-18", seconds: 60 }, { date: "2026-11-17", seconds: 60 }] }).mood).toBe("streak");
  });

  it("a quiet week with work on the board is a nudge back in, never a scold", () => {
    expect(momentum({ ...base, applications: [app("saved", "2026-10-01")] }).mood).toBe("quiet");
  });

  it("closed applications are counted as tries, never as failure moods", () => {
    const m = momentum({ ...base, applications: [app("closed", "2026-10-01", "2026-10-02"), app("applied", "2026-11-01", "2026-11-18")] });
    expect(m.tries).toBe(2);
    expect(m.mood).toBe("moving");
  });
});

describe("momentum: next steps", () => {
  it("orders follow-ups, then chasing quiet applications, then sending a saved one, then new roles, then practice", () => {
    const m = momentum({
      ...base,
      followupsDue: 2,
      stale: 1,
      openRoles: 4,
      applications: [app("saved", "2026-11-02", null, "s-new"), app("saved", "2026-10-20", null, "s-old")],
    });
    expect(m.next.map((n) => n.kind)).toEqual(["follow-up", "chase", "send"]);
    expect(m.next[2]).toMatchObject({ count: 2, applicationId: "s-old" });
  });

  it("with nothing urgent, suggests adding a job and practising", () => {
    expect(momentum(base).next.map((n) => n.kind)).toEqual(["add", "practise"]);
  });
});

describe("momentum: each activity on its own", () => {
  const m = momentum({
    ...base,
    applications: [app("applied", "2026-11-01", "2026-11-19"), app("applied", "2026-11-01", "2026-11-18"), app("closed", "2026-10-01", "2026-10-03")],
    outreachDates: ["2026-11-19", "2026-11-17", "2026-11-16"],
    practice: [
      { date: "2026-11-18", seconds: 600 },
      { date: "2026-11-17", seconds: 300 },
      { date: "2026-11-02", seconds: 1500 },
    ],
  });
  const by = Object.fromEntries(m.activities.map((a) => [a.key, a]));

  it("keeps a streak per activity, each ending today or yesterday", () => {
    expect(by.apply!.streak).toBe(2);
    expect(by.reachOut!.streak).toBe(1);
    expect(by.practise!.streak).toBe(2);
  });

  it("totals: every application ever sent, every conversation, and practice time in seconds", () => {
    expect(by.apply!.total).toBe(3);
    expect(by.reachOut!.total).toBe(3);
    expect(by.practise!.total).toBe(3);
    expect(m.practiceSeconds).toBe(2400);
  });

  it("each activity has its own 14 days, oldest first", () => {
    expect(by.reachOut!.days.map((d) => d.count).slice(-4)).toEqual([1, 1, 0, 1]);
    expect(by.apply!.days).toHaveLength(14);
  });

  it("this week's count and goal ride along on each activity", () => {
    const g = momentum({ ...base, goals: { reachOut: 3 }, outreachDates: ["2026-11-19"] });
    const r = g.activities.find((a) => a.key === "reachOut")!;
    expect(r).toMatchObject({ week: 1, goal: 3 });
    expect(g.activities.find((a) => a.key === "apply")!.goal).toBeUndefined();
  });
});
