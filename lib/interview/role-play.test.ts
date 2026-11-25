import { describe, it, expect } from "vitest";
import { buildRolePlayPrompt, guardRolePlay, likelyFollowUps, parseRolePlay, rolePlayBasis, RolePlayInputSchema } from "./role-play";

const MODEL = "I led the files migration at Nutanix. I set the boundary between two teams and ran six phases. We migrated 10 PB and earned $1M in recurring revenue in year one.";
const Q = "Walk me through something impactful you built.";

describe("rolePlayBasis", () => {
  it("is stable for the same text and changes when the model answer changes", () => {
    expect(rolePlayBasis(MODEL)).toBe(rolePlayBasis(` ${MODEL} `));
    expect(rolePlayBasis(MODEL)).not.toBe(rolePlayBasis(`${MODEL} More.`));
  });
});

describe("likelyFollowUps", () => {
  it("names the probes a real interviewer would reach for, depth always among them", () => {
    const f = likelyFollowUps(MODEL);
    expect(f).toContain("depth");
    expect(f).toContain("reflection");
    expect(f.length).toBeLessThanOrEqual(3);
  });
});

describe("buildRolePlayPrompt", () => {
  it("carries the persona, the question, the model answer and the follow-ups to show", () => {
    const p = buildRolePlayPrompt({
      question: Q,
      lookFor: "depth",
      interviewer: "a Deployed Engineer at Cognition",
      context: "they drill",
      contextLabel: "Interview brief",
      modelAnswer: MODEL,
      followUps: ["depth", "reflection"],
    });
    expect(p).toContain("a Deployed Engineer at Cognition");
    expect(p).toContain(Q);
    expect(p).toContain(MODEL);
    expect(p).toContain("reflection");
    expect(p).toContain('"lines"');
  });
});

describe("parseRolePlay", () => {
  const lines = [
    { who: "interviewer", say: "Tell me." },
    { who: "candidate", say: "I led it.", why: "Leads with ownership." },
    { who: "interviewer", say: "Why that boundary?" },
    { who: "candidate", say: "Because Files knew the data path.", why: "Gives the reason." },
  ];
  it("keeps lines, puts the real question first, keeps why only on candidate lines", () => {
    const out = parseRolePlay({ lines: [lines[0], lines[1], { ...lines[2], why: "x" }, lines[3]] }, Q);
    expect(out[0]).toEqual({ who: "interviewer", say: Q });
    expect(out[1]).toEqual({ who: "candidate", say: "I led it.", why: "Leads with ownership." });
    expect(out[2]).toEqual({ who: "interviewer", say: "Why that boundary?" });
  });
  it("refuses too short a play or one that does not open with the interviewer", () => {
    expect(() => parseRolePlay({ lines: lines.slice(0, 2) }, Q)).toThrow();
    expect(() => parseRolePlay({ lines: [lines[1], lines[0], lines[1], lines[0]] }, Q)).toThrow();
  });

  it("skips incomplete lines without losing the rest of the exchange", () => {
    expect(parseRolePlay({ lines: [lines[0], { say: "No speaker." }, lines[1], { who: "candidate" }, ...lines.slice(2)] }, Q))
      .toEqual([{ who: "interviewer", say: Q }, ...lines.slice(1)]);
  });

  it("drops the answer to an incomplete follow-up question", () => {
    const incomplete = [{ who: "interviewer" }, { who: "candidate", say: "An answer with no question." }];
    expect(parseRolePlay({ lines: [lines[0], lines[1], ...incomplete, ...lines.slice(2)] }, Q))
      .toEqual([{ who: "interviewer", say: Q }, ...lines.slice(1)]);
  });
});

describe("guardRolePlay", () => {
  it("passes when every number the candidate says is in the model answer", () => {
    const play = parseRolePlay(
      { lines: [{ who: "interviewer", say: Q }, { who: "candidate", say: "We moved 10 PB." }, { who: "interviewer", say: "And 10 PB took how long?" }, { who: "candidate", say: "Six phases." }] },
      Q,
    );
    expect(guardRolePlay(play, { modelAnswer: MODEL, written: "" })).toEqual({ ok: true, lines: play });
  });
  it("refuses a candidate number the evidence lacks, or an interviewer number nobody said", () => {
    const bad = parseRolePlay(
      { lines: [{ who: "interviewer", say: Q }, { who: "candidate", say: "Revenue grew 40%." }, { who: "interviewer", say: "And the 30 engineers?" }, { who: "candidate", say: "Yes." }] },
      Q,
    );
    const r = guardRolePlay(bad, { modelAnswer: MODEL, written: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invented).toEqual(["40%", "30"]);
  });
  it("a number from the written answer is fine for the candidate", () => {
    const play = parseRolePlay(
      { lines: [{ who: "interviewer", say: Q }, { who: "candidate", say: "300 bugs." }, { who: "interviewer", say: "Why?" }, { who: "candidate", say: "Quality." }] },
      Q,
    );
    expect(guardRolePlay(play, { modelAnswer: MODEL, written: "closed 300 bugs" }).ok).toBe(true);
  });
});

describe("RolePlayInputSchema (agent-written over MCP)", () => {
  it("accepts lines and refuses an over-long play", () => {
    const one = { who: "interviewer", say: "x" };
    expect(RolePlayInputSchema.safeParse([one, { who: "candidate", say: "y" }]).success).toBe(true);
    expect(RolePlayInputSchema.safeParse(Array(30).fill(one)).success).toBe(false);
  });
});
