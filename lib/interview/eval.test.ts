import { describe, it, expect } from "vitest";
import type { FullPlan } from "./full-plan";
import { startFull, type FullSession, type FullTurn } from "./full-session";
import { buildEvalSet, buildJudgePrompt, parseEvalSet, parseJudge, scoreLine, summarize, type EvalCase } from "./eval";

const AT = "2026-11-21T10:00:00Z";
const plan: FullPlan = {
  applicationId: "a1",
  company: "Grab",
  role: "PM",
  source: "role",
  round: null,
  interviewer: null,
  contextLabel: "Interview brief",
  topics: [
    { id: "t1", kind: "topic", competency: "Impact", text: "Tell me about a launch.", short: "Launch", lookFor: "depth", context: null },
    { id: "t2", kind: "topic", competency: "Failure", text: "Tell me about a failure.", short: "Failure", lookFor: "honesty", context: null },
  ],
};
const base = startFull(plan, { maxTopics: 2, topicFollowUps: 2, totalFollowUps: 3 }, "neutral", AT);
const turn = (role: FullTurn["role"], text: string, extra: Partial<FullTurn> = {}): FullTurn => ({ role, text, topicId: "t1", at: AT, ...extra });
const done: FullSession = {
  ...base,
  status: "done",
  turns: [
    turn("interviewer", "Tell me about a launch."),
    turn("candidate", "We cut churn by 10% with onboarding."),
    turn("interviewer", "Why 10%?", { move: "deepen" }),
    turn("candidate", "The pilot showed it."),
    turn("interviewer", "Why exactly 10%?", { move: "deepen" }),
    turn("candidate", "Finance agreed."),
    turn("interviewer", "Tell me about a failure.", { move: "next:t2", topicId: "t2" }),
    turn("candidate", "I shipped late once.", { topicId: "t2" }),
    turn("interviewer", "Thank you - that's everything from me today.", { move: "close", topicId: "t2" }),
  ],
};

describe("buildEvalSet", () => {
  const set = buildEvalSet(
    [{ id: "s1", session: done }, { id: "s2", session: { ...base } }],
    [{ sessionId: "s1", turnIndex: 4, rating: "bad", better: "What did finance push back on?" }],
    { t1: "My notes on the launch." },
    AT,
  );

  it("makes one case per interviewer decision in a finished interview: no opener, no close, no running interview", () => {
    expect(set.cases.map((c) => c.id)).toEqual(["s1:2", "s1:4", "s1:6"]);
  });

  it("gives each case only what the interviewer could see at that moment", () => {
    const c = set.cases[1];
    expect(c.session.status).toBe("running");
    expect(c.session.turns).toHaveLength(3);
    expect(c.latest).toBe("The pilot showed it.");
    expect(c.written).toBe("My notes on the launch.");
    expect(c.recorded).toEqual({ move: "deepen", say: "Why exactly 10%?" });
  });

  it("carries your rating and better line as labels", () => {
    expect(set.cases[1]).toMatchObject({ rating: "bad", better: "What did finance push back on?" });
    expect(set.cases[0].rating).toBeUndefined();
  });

  it("round-trips through JSON and refuses anything else", () => {
    expect(parseEvalSet(JSON.parse(JSON.stringify(set)))).toEqual(set);
    expect(() => parseEvalSet({ version: 99, cases: [] })).toThrow();
  });
});

describe("scoreLine", () => {
  const set = buildEvalSet([{ id: "s1", session: done }], [{ sessionId: "s1", turnIndex: 4, rating: "bad", better: null }], {}, AT);
  const c = set.cases[1];

  it("finds the recorded loop and the line you marked bad", () => {
    expect(scoreLine(c, "deepen", "Why exactly 10%?").problems).toEqual(["repeat", "same-as-bad"]);
  });

  it("passes a fresh, grounded line", () => {
    expect(scoreLine(c, "deepen", "You said the pilot showed it. What did the pilot measure?").problems).toEqual([]);
  });
});

describe("summarize", () => {
  it("counts clean lines, each problem, rated outcomes and the judge's average", () => {
    const c = { rating: "bad" } as EvalCase;
    const sum = summarize([
      { id: "a", move: "deepen", line: "x", problems: [], judge: { score: 4, why: "" } },
      { id: "b", move: "deepen", line: "y", problems: ["repeat", "same-as-bad"], judge: { score: 2, why: "" } },
      { id: "c", move: "next:t2", line: "z", problems: ["ungrounded"] },
    ], [c, c, { } as EvalCase]);
    expect(sum).toEqual({
      cases: 3,
      clean: 1,
      problems: { repeat: 1, "same-as-bad": 1, ungrounded: 1 },
      moves: { deepen: 2, next: 1 },
      ratedBad: 2,
      badRepeated: 1,
      judge: { scored: 2, average: 3 },
    });
  });
});

describe("judge", () => {
  const set = buildEvalSet([{ id: "s1", session: done }], [{ sessionId: "s1", turnIndex: 4, rating: "bad", better: "What did finance push back on?" }], {}, AT);

  it("shows the judge the conversation, the line and your better line, but no model answer", () => {
    const p = buildJudgePrompt(set.cases[1], "Why exactly 10%?");
    expect(p).toContain("Candidate: The pilot showed it.");
    expect(p).toContain('"Why exactly 10%?"');
    expect(p).toContain("What did finance push back on?");
    expect(p).toMatch(/JSON/);
  });

  it("reads a 1-5 score and refuses anything else", () => {
    expect(parseJudge({ score: 4, why: " sharp " })).toEqual({ score: 4, why: "sharp" });
    expect(parseJudge({ score: "5", why: "" })).toEqual({ score: 5, why: "" });
    expect(() => parseJudge({ score: 9 })).toThrow();
  });
});
