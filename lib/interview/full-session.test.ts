import { describe, it, expect } from "vitest";
import type { FullPlan, FullInterviewSettings } from "./full-plan";
import {
  applyFullTurn,
  buildFullDebriefPrompt,
  buildFullTurnPrompt,
  canScoreFull,
  closeFull,
  composeLine,
  currentTopicId,
  DEEPEN_FALLBACK,
  FULL_CLOSING_LINE,
  fallbackReply,
  guardFullReply,
  legalMoves,
  needsModel,
  parseFullDebrief,
  parseFullReply,
  parseFullSession,
  startFull,
  topicsAsked,
  type FullSession,
} from "./full-session";
import { FOLLOW_UP_FALLBACK } from "./mock";

const NOW = "2026-11-20T10:00:00.000Z";

const plan: FullPlan = {
  applicationId: "app1",
  company: "Cognition",
  role: "Deployed Engineer",
  source: "role",
  round: "Technical interview",
  interviewer: "a Deployed Engineer at Cognition",
  contextLabel: "Interview brief",
  topics: [
    { id: "role:bg", kind: "opener", competency: "Motivation", text: "Walk me through your background.", short: "Background", lookFor: "an arc", context: null },
    { id: "role:impact", kind: "topic", competency: "Technical depth", text: "Walk me through something impactful you built.", short: "Impact", lookFor: "depth", context: "they drill" },
    { id: "role:fail", kind: "topic", competency: "Technical depth", text: "What happens when it fails halfway?", short: "Failure", lookFor: "recovery", context: null },
    { id: "role:agents", kind: "topic", competency: "Agent fluency", text: "Where do agents fail for you?", short: "Agents", lookFor: "honest limits", context: null },
    { id: "role:q", kind: "close", competency: "Motivation", text: "What questions do you have for me?", short: "Your questions", lookFor: "good questions", context: null },
  ],
};
const settings: FullInterviewSettings = { maxTopics: 4, topicFollowUps: 2, totalFollowUps: 3 };

const STRONG =
  "I personally led the files migration. I set the boundary between the two teams, I ran six phases, and I closed 300 bugs in six weeks. The result was 10 PB migrated and $1M in recurring revenue. Looking back, I would have involved QA earlier, which I learned the hard way.";
const VAGUE = "We did a lot of things and the team worked hard on it.";

const start = () => startFull(plan, settings, "neutral", NOW);

describe("startFull", () => {
  it("opens on the first topic, asked by code", () => {
    const s = start();
    expect(s.status).toBe("running");
    expect(s.turns).toEqual([{ role: "interviewer", text: "Walk me through your background.", topicId: "role:bg", at: NOW }]);
    expect(currentTopicId(s)).toBe("role:bg");
  });
});

describe("legalMoves", () => {
  it("a vague answer: rule gaps first, then deepen, then the next two topics (never the close yet)", () => {
    const moves = legalMoves(start(), VAGUE, "");
    expect(moves[0]).toBe("probe:ownership");
    expect(moves).toContain("probe:result");
    expect(moves).toContain("deepen");
    expect(moves).not.toContain("probe:depth");
    expect(moves.filter((m) => m.startsWith("next:"))).toEqual(["next:role:impact", "next:role:fail"]);
  });

  it("a strong first answer: deepen is code's first choice", () => {
    const moves = legalMoves(start(), STRONG, "");
    expect(moves[0]).toBe("deepen");
    expect(moves.some((m) => m.startsWith("probe:"))).toBe(false);
  });

  it("after the topic cap only moving on is allowed", () => {
    let s = start();
    s = applyFullTurn(s, VAGUE, { move: "probe:ownership", say: "What did you do?" }, NOW);
    s = applyFullTurn(s, VAGUE, { move: "deepen", say: "Why?" }, NOW);
    const moves = legalMoves(s, STRONG, "");
    expect(moves.every((m) => m.startsWith("next:"))).toBe(true);
  });

  it("after the total cap, no follow-ups on any later topic", () => {
    let s = start();
    s = applyFullTurn(s, VAGUE, { move: "probe:ownership", say: "a" }, NOW);
    s = applyFullTurn(s, VAGUE, { move: "deepen", say: "b" }, NOW);
    s = applyFullTurn(s, VAGUE, { move: "next:role:impact", say: "" }, NOW);
    s = applyFullTurn(s, VAGUE, { move: "probe:result", say: "c" }, NOW);
    expect(legalMoves(s, VAGUE, "").every((m) => m.startsWith("next:"))).toBe(true);
  });

  it("with one topic of room left, only the close topic is offered", () => {
    let s = start();
    s = applyFullTurn(s, STRONG, { move: "next:role:impact", say: "" }, NOW);
    s = applyFullTurn(s, STRONG, { move: "next:role:agents", say: "" }, NOW);
    expect(topicsAsked(s)).toEqual(["role:bg", "role:impact", "role:agents"]);
    expect(legalMoves(s, STRONG, "").filter((m) => m.startsWith("next:"))).toEqual(["next:role:q"]);
  });

  it("on the close topic the only move is to end", () => {
    let s = start();
    s = applyFullTurn(s, STRONG, { move: "next:role:q", say: "" }, NOW);
    expect(legalMoves(s, "What does a first month look like?", "")).toEqual(["close"]);
  });

  it("a number said aloud that the written answer lacks is probed first", () => {
    expect(legalMoves(start(), "I led 40 engineers and we shipped.", "I led 11 engineers.")[0]).toBe("probe:numbers");
  });
});

describe("needsModel", () => {
  it("only when there is a real choice", () => {
    expect(needsModel(["close"])).toBe(false);
    expect(needsModel(["next:role:q"])).toBe(false);
    expect(needsModel(["deepen", "next:role:q"])).toBe(true);
  });
});

describe("parseFullReply", () => {
  const legal = ["probe:ownership", "deepen", "next:role:impact"];
  it("keeps a legal move, the line, the assessment and the private note", () => {
    expect(parseFullReply({ move: "deepen", say: " Why  that? ", assessment: "strong", note: "clear" }, legal)).toEqual({
      move: "deepen",
      say: "Why that?",
      assessment: "strong",
      note: "clear",
    });
  });
  it("an illegal move becomes code's first choice, with its stock line", () => {
    const r = parseFullReply({ move: "next:role:q", say: "Any questions?", assessment: "great" }, legal);
    expect(r.move).toBe("probe:ownership");
    expect(r.say).toBe(FOLLOW_UP_FALLBACK.ownership);
    expect(r.assessment).toBeUndefined();
  });
  it("a next move may have an empty bridge", () => {
    expect(parseFullReply({ move: "next:role:impact", say: "" }, legal).say).toBe("");
  });
  it("a probe with no line throws", () => {
    expect(() => parseFullReply({ move: "deepen", say: "" }, legal)).toThrow();
  });
});

describe("guardFullReply", () => {
  it("replaces a follow-up that states a number nobody said", () => {
    const s = start();
    expect(guardFullReply({ move: "deepen", say: "Was it 50 engineers?" }, s, VAGUE, "").say).toBe(DEEPEN_FALLBACK);
    expect(guardFullReply({ move: "probe:result", say: "Did revenue grow 20%?" }, s, VAGUE, "").say).toBe(FOLLOW_UP_FALLBACK.result);
  });
  it("drops a bridge with an invented number but keeps the move", () => {
    expect(guardFullReply({ move: "next:role:impact", say: "You grew it 3x." }, start(), VAGUE, "")).toEqual({ move: "next:role:impact", say: "" });
  });
  it("keeps numbers the candidate said", () => {
    const r = { move: "deepen", say: "You said 300 bugs in six weeks - how?" };
    expect(guardFullReply(r, start(), STRONG, "")).toEqual(r);
  });
});

describe("composeLine and applyFullTurn", () => {
  it("a next move asks the planned question verbatim, after the bridge", () => {
    expect(composeLine({ move: "next:role:fail", say: "Thanks." }, plan)).toBe("Thanks. What happens when it fails halfway?");
    expect(composeLine({ move: "next:role:fail", say: "" }, plan)).toBe("What happens when it fails halfway?");
  });

  it("records the candidate on the current topic and the interviewer on the next", () => {
    const s = applyFullTurn(start(), STRONG, { move: "next:role:impact", say: "", assessment: "strong", note: "good arc" }, NOW);
    expect(s.turns.slice(1)).toEqual([
      { role: "candidate", text: STRONG, topicId: "role:bg", at: NOW },
      { role: "interviewer", text: plan.topics[1].text, topicId: "role:impact", move: "next:role:impact", assessment: "strong", note: "good arc", at: NOW },
    ]);
  });

  it("a close move ends the interview with the closing line", () => {
    const s = applyFullTurn(start(), STRONG, { move: "close", say: "" }, NOW);
    expect(s.status).toBe("done");
    expect(s.turns.at(-1)?.text).toBe(FULL_CLOSING_LINE);
  });

  it("refuses a turn after the end", () => {
    const s = closeFull(start(), STRONG, NOW);
    expect(() => applyFullTurn(s, "x", { move: "close", say: "" }, NOW)).toThrow();
  });

  it("fallbackReply follows code's first choice", () => {
    expect(fallbackReply(["deepen", "next:role:impact"])).toEqual({ move: "deepen", say: DEEPEN_FALLBACK });
    expect(fallbackReply(["next:role:impact"])).toEqual({ move: "next:role:impact", say: "" });
  });
});

describe("buildFullTurnPrompt", () => {
  it("carries the persona, the yardstick privately, the legal moves and the next topics' questions", () => {
    const s = start();
    const p = buildFullTurnPrompt({ session: s, latest: VAGUE, legal: legalMoves(s, VAGUE, ""), modelAnswer: "MODEL ANSWER TEXT" });
    expect(p).toContain("You are a Deployed Engineer at Cognition");
    expect(p).toContain("MODEL ANSWER TEXT");
    expect(p).toMatch(/never (quote|reveal)/i);
    expect(p).toContain("next:role:impact");
    expect(p).toContain("Walk me through something impactful you built.");
    expect(p).toContain(VAGUE);
    expect(p).toContain('"assessment"');
  });
});

describe("closeFull, canScoreFull", () => {
  it("ends with or without a last answer", () => {
    expect(closeFull(start(), null, NOW).turns).toHaveLength(2);
    expect(closeFull(start(), STRONG, NOW).turns).toHaveLength(3);
  });
  it("needs enough said to score", () => {
    expect(canScoreFull(closeFull(start(), VAGUE, NOW))).toBe(false);
    expect(canScoreFull(closeFull(start(), STRONG, NOW))).toBe(true);
  });
});

describe("debrief", () => {
  const done = (): FullSession => {
    let s = start();
    s = applyFullTurn(s, STRONG, { move: "next:role:impact", say: "", assessment: "strong", note: "clear arc" }, NOW);
    return closeFull(s, VAGUE, NOW);
  };

  it("the prompt has the plan, private notes, model answers and transcript", () => {
    const p = buildFullDebriefPrompt({ session: done(), modelAnswers: { "role:impact": "I led the files migration." }, delivery: "", fillers: "" });
    expect(p).toContain("Walk me through something impactful you built.");
    expect(p).toContain("clear arc");
    expect(p).toContain("I led the files migration.");
    expect(p).toContain(VAGUE);
    expect(p).toContain('"moments"');
  });

  const scores = { structure: 4, ownership: 3, specificity: 3, impact: 4, reflection: 2, relevance: 4 };

  it("keeps per-topic verdicts for asked topics only, and moments whose quote was really said", () => {
    const d = parseFullDebrief(
      {
        scores,
        strengths: ["a"],
        improvements: ["b"],
        perTopic: [
          { topicId: "role:bg", verdict: "held", note: "good" },
          { topicId: "role:agents", verdict: "weak", note: "never asked" },
          { topicId: "role:impact", verdict: "nonsense", note: "x" },
        ],
        moments: [
          { topicId: "role:impact", quote: "the team worked hard", better: "Say what you led: the files migration." },
          { topicId: "role:impact", quote: "I invented this", better: "x" },
          { topicId: "role:impact", quote: "we did a lot", better: "Say you cut costs 70%." },
        ],
      },
      done(),
      { "role:impact": "I led the files migration." },
    );
    expect(d.perTopic).toEqual([{ topicId: "role:bg", verdict: "held", note: "good" }]);
    expect(d.moments).toEqual([{ topicId: "role:impact", quote: "the team worked hard", better: "Say what you led: the files migration." }]);
    expect(d.scores.structure).toBe(4);
  });
});

describe("parseFullSession", () => {
  it("round-trips a session and rejects junk", () => {
    const s = applyFullTurn(start(), STRONG, { move: "deepen", say: "Why?", assessment: "adequate" }, NOW);
    expect(parseFullSession(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(() => parseFullSession({ turns: [] })).toThrow();
  });
});
