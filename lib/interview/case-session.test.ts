import { describe, it, expect } from "vitest";
import { parseCaseLibrary, type CaseSheet } from "./case-sheet";
import {
  CASE_DIMENSIONS,
  advance,
  applyTurn,
  buildDebriefPrompt,
  buildTurnPrompt,
  caseSignals,
  checkMath,
  currentQuestion,
  forcedAdvance,
  guardReply,
  parseDebrief,
  parseNumbers,
  parseTurnReply,
  startSession,
} from "./case-session";

const sheet: CaseSheet = parseCaseLibrary({
  cases: [
    {
      id: "c1",
      title: "Acme buys Beta",
      firm: "bain",
      style: "candidate-led",
      caseType: "m-and-a",
      sector: "software",
      level: "medium",
      minutes: 30,
      prompt: "Acme is thinking about buying Beta. Should it?",
      facts: [{ id: "goal", ask: ["goal"], text: "Acme wants 8% growth." }],
      questions: [
        { id: "structure", kind: "structure", ask: "How would you approach this?", keyPoints: ["market", "target"] },
        {
          id: "math",
          kind: "math",
          ask: "What is the most Acme should pay?",
          given: ["Beta EBITDA is US$20m."],
          onRequest: ["Peers trade at 18x."],
          answer: { value: 360e6, display: "US$360m", tolerance: 0.02, working: ["20 x 18 = 360"] },
        },
        {
          id: "chart",
          kind: "chart",
          ask: "What do you see?",
          exhibit: { title: "Revenue", columns: ["Year", "Revenue"], rows: [["2024", 100]] },
          keyPoints: ["flat"],
        },
        { id: "rec", kind: "recommendation", ask: "Your recommendation?" },
      ],
      recommendation: { answer: "Buy below US$360m.", reasoning: ["r"], risks: ["k"], next: ["n"] },
    },
  ],
}).cases[0];

const t0 = "2026-09-24T10:00:00.000Z";
const at = (min: number) => new Date(Date.parse(t0) + min * 60_000).toISOString();

describe("parseNumbers", () => {
  it("reads plain numbers, thousands separators and decimals", () => {
    expect(parseNumbers("about 1,200 clinics and 2.5 visits").map((n) => n.value)).toEqual([1200, 2.5]);
  });

  it("applies scale words and suffixes", () => {
    const v = parseNumbers("US$456m, then 1.2bn, 30k and 3 million").map((n) => n.value);
    expect(v).toEqual([456e6, 1.2e9, 30e3, 3e6]);
  });

  it("keeps percentages and multiples as they are, and marks them", () => {
    const [p, x] = parseNumbers("growth of 20% at 2.1x");
    expect(p).toMatchObject({ value: 20, unit: "%" });
    expect(x).toMatchObject({ value: 2.1, unit: "x" });
  });
});

describe("checkMath", () => {
  const answer = { value: 360e6, display: "US$360m", tolerance: 0.02, working: [] };

  it("accepts the right figure however it is written", () => {
    expect(checkMath(answer, "So the most we pay is 360 million").correct).toBe(true);
    expect(checkMath(answer, "I get US$360m").correct).toBe(true);
    expect(checkMath(answer, "roughly 0.36bn").correct).toBe(true);
    expect(checkMath(answer, "I'd say 360").correct).toBe(true); // bare number, scale implied
  });

  it("accepts a figure within tolerance and rejects one outside it", () => {
    expect(checkMath(answer, "about 355 million").correct).toBe(true);
    expect(checkMath(answer, "about 340 million").correct).toBe(false);
  });

  it("reports the closest figure it heard, or null when there was none", () => {
    expect(checkMath(answer, "I think 340m, maybe 320m").heard).toBe(340e6);
    expect(checkMath(answer, "Let me think about the approach first").heard).toBeNull();
  });

  it("does not rescale a percentage into an absolute amount", () => {
    const pct = { value: 4e6, display: "US$4m", tolerance: 0.03, working: [] };
    expect(checkMath(pct, "churn went up by 4%").correct).toBe(false);
  });

  it("checks multiples", () => {
    const moic = { value: 2.08, display: "2.1x", tolerance: 0.03, working: [] };
    expect(checkMath(moic, "that's a 2.1x return").correct).toBe(true);
    expect(checkMath(moic, "about 3x").correct).toBe(false);
  });
});

describe("session flow", () => {
  it("opens with the prompt on the first question", () => {
    const s = startSession(sheet, t0);
    expect(s.index).toBe(0);
    expect(s.status).toBe("running");
    expect(s.turns).toEqual([{ role: "interviewer", text: sheet.prompt, questionId: "structure", at: t0 }]);
    expect(currentQuestion(sheet, s)?.id).toBe("structure");
  });

  it("advancing asks the next question with what is given, and never the on-request data", () => {
    const s = advance(sheet, startSession(sheet, t0), at(5));
    expect(s.index).toBe(1);
    const last = s.turns[s.turns.length - 1];
    expect(last).toMatchObject({ role: "interviewer", questionId: "math" });
    expect(last.text).toContain("What is the most Acme should pay?");
    expect(last.text).toContain("Beta EBITDA is US$20m.");
    expect(last.text).not.toContain("18x");
  });

  it("puts an exhibit on the table when a chart question starts", () => {
    const s = advance(sheet, advance(sheet, startSession(sheet, t0), at(1)), at(2));
    expect(s.turns.slice(-2).map((t) => t.role)).toEqual(["interviewer", "exhibit"]);
    expect(s.turns[s.turns.length - 1]).toMatchObject({ questionId: "chart", text: "Revenue" });
  });

  it("finishes after the last question instead of running past it", () => {
    let s = startSession(sheet, t0);
    for (let i = 0; i < sheet.questions.length; i++) s = advance(sheet, s, at(i + 1));
    expect(s.status).toBe("done");
    expect(s.index).toBe(sheet.questions.length - 1);
  });

  it("applyTurn records both sides and moves on only when told to, without mutating the input", () => {
    const s0 = startSession(sheet, t0);
    const s1 = applyTurn(sheet, s0, "Is there a growth goal?", { say: "Yes, 8% a year.", advance: false }, at(1));
    expect(s0.turns).toHaveLength(1);
    expect(s1.turns.slice(1).map((t) => [t.role, t.text])).toEqual([
      ["candidate", "Is there a growth goal?"],
      ["interviewer", "Yes, 8% a year."],
    ]);
    expect(s1.index).toBe(0);
    const s2 = applyTurn(sheet, s1, "My structure is market, target...", { say: "Good.", advance: true }, at(3));
    expect(s2.index).toBe(1);
  });

  it("when moving on, drops any question the model asked itself - code asks the next one, so it is never asked twice", () => {
    const s = applyTurn(
      sheet,
      startSession(sheet, t0),
      "Four buckets: market, target, fit, price.",
      { say: "Good structure. Before we look at numbers, what is the most Acme should pay?", advance: true },
      at(2),
    );
    const said = s.turns.filter((t) => t.role === "interviewer").map((t) => t.text);
    expect(said[1]).toBe("Good structure.");
    expect(said[2]).toContain("What is the most Acme should pay?");
  });

  it("falls back to a neutral acknowledgement when the model's whole line was a question", () => {
    const s = applyTurn(sheet, startSession(sheet, t0), "My structure...", { say: "What would you look at first?", advance: true }, at(2));
    expect(s.turns[2].text).toBe("Thanks - let's move on.");
  });

  it("keeps a question in the line when staying on the same question", () => {
    const s = applyTurn(sheet, startSession(sheet, t0), "Hmm.", { say: "What would you look at first?", advance: false }, at(2));
    expect(s.turns[2].text).toBe("What would you look at first?");
  });

  it("remembers a correct math answer for the debrief", () => {
    const s = advance(sheet, startSession(sheet, t0), at(1));
    const check = checkMath(sheet.questions[1].answer!, "360 million");
    const s2 = applyTurn(sheet, s, "360 million", { say: "Right.", advance: true }, at(4), check);
    expect(s2.mathChecks).toEqual([{ questionId: "math", expected: 360e6, heard: 360e6, correct: true }]);
  });
});

describe("forcedAdvance - code, not the model, guarantees the case moves", () => {
  it("moves on as soon as the math is right", () => {
    const s = advance(sheet, startSession(sheet, t0), at(1));
    expect(forcedAdvance(sheet, s, { questionId: "math", expected: 360e6, heard: 360e6, correct: true })).toBe("math-correct");
    expect(forcedAdvance(sheet, s, { questionId: "math", expected: 360e6, heard: 300e6, correct: false })).toBeNull();
  });

  it("caps the turns on a question, allowing more for the opening's clarifying questions", () => {
    let s = startSession(sheet, t0);
    for (let i = 0; i < 4; i++) s = applyTurn(sheet, s, `question ${i}?`, { say: "ok", advance: false }, at(i + 1));
    expect(forcedAdvance(sheet, s)).toBe("turn-cap"); // this would be the 5th turn on the opening
    let m = advance(sheet, startSession(sheet, t0), at(1));
    m = applyTurn(sheet, m, "hmm", { say: "ok", advance: false }, at(2));
    expect(forcedAdvance(sheet, m)).toBeNull();
    m = applyTurn(sheet, m, "hmm again", { say: "ok", advance: false }, at(3));
    expect(forcedAdvance(sheet, m)).toBe("turn-cap"); // the 3rd turn on a later question
  });

  it("a closing prompt asks only for an acknowledgement - the next question is asked by code", () => {
    const s = advance(sheet, startSession(sheet, t0), at(1));
    const p = buildTurnPrompt(sheet, s, "360m", { questionId: "math", expected: 360e6, heard: 360e6, correct: true }, true);
    expect(p).toMatch(/acknowledge/i);
    expect(p).toMatch(/do not ask/i);
    expect(p).toMatch(/neutral/i); // never tells the candidate they were right
  });
});

describe("guardReply - the interviewer may not invent figures or repeat itself", () => {
  const onMath = advance(sheet, startSession(sheet, t0), at(1)); // math question: given "Beta EBITDA is US$20m."

  it("passes a line whose numbers all come from the case or the candidate", () => {
    const r = guardReply(sheet, onMath, "I'd use 20 times something", { say: "You have EBITDA of US$20m. What multiple would you use?", advance: false });
    expect(r).toMatchObject({ say: "You have EBITDA of US$20m. What multiple would you use?", guarded: null });
  });

  it("replaces a line that states a figure found nowhere in the case - e.g. its own wrong sum", () => {
    const r = guardReply(sheet, onMath, "Let me think.", { say: "Beta's total costs are US$55m, so what's the margin?", advance: false });
    expect(r.guarded).toBe("unsupported-number");
    expect(r.say).not.toContain("55");
  });

  it("never lets the hidden answer slip out", () => {
    const r = guardReply(sheet, onMath, "Not sure.", { say: "Think about whether it could be around 360.", advance: false });
    expect(r.guarded).toBe("unsupported-number");
  });

  it("does not let a percentage in the case pass as an amount (seen live: '50%' let 'US$50 million' through)", () => {
    // The case says "Acme wants 8% growth." - so "8%" is allowed, "US$8 million" is not.
    expect(guardReply(sheet, onMath, "hmm", { say: "Growth target is 8%.", advance: false }).guarded).toBeNull();
    expect(guardReply(sheet, onMath, "hmm", { say: "Acme's revenue is US$8 million.", advance: false }).guarded).toBe("unsupported-number");
  });

  it("does not let an amount pass as a percentage (seen live: '$15 million' let '15% margin' through)", () => {
    const r = guardReply(sheet, onMath, "So revenue would be $15 million.", { say: "Beta's margin is 15%.", advance: false });
    expect(r.guarded).toBe("unsupported-number");
  });

  it("still lets the interviewer quote a case amount without its unit", () => {
    expect(guardReply(sheet, onMath, "hmm", { say: "EBITDA is 20 - what next?", advance: false }).guarded).toBeNull();
  });

  it("allows small counting numbers", () => {
    expect(guardReply(sheet, onMath, "hmm", { say: "Give me 2 ways to value it.", advance: false }).guarded).toBeNull();
  });

  it("replaces a nudge it has already given on this question", () => {
    const s = applyTurn(sheet, onMath, "hmm", { say: "What multiple would you use?", advance: false }, at(2));
    const r = guardReply(sheet, s, "not sure", { say: "What multiple would you use?", advance: false });
    expect(r.guarded).toBe("repeat");
    expect(r.say).not.toBe("What multiple would you use?");
  });
});

describe("parseTurnReply", () => {
  it("accepts 'done' as the move-on flag", () => {
    expect(parseTurnReply({ say: "Thanks.", done: true }).advance).toBe(true);
  });

  it("reads the interviewer's line and whether to move on", () => {
    expect(parseTurnReply({ say: "  Fair question. ", advance: true })).toEqual({ say: "Fair question.", advance: true });
  });

  it("treats a missing advance flag as staying on the question", () => {
    expect(parseTurnReply({ say: "Go on." }).advance).toBe(false);
  });

  it("rejects an empty line", () => {
    expect(() => parseTurnReply({ say: "  " })).toThrow();
  });
});

describe("buildTurnPrompt", () => {
  const s = advance(sheet, startSession(sheet, t0), at(1));
  const p = buildTurnPrompt(sheet, s, "What multiple do peers trade at?");

  it("gives the interviewer the facts, the current question and its hidden answer", () => {
    expect(p).toContain("Acme wants 8% growth.");
    expect(p).toContain("What is the most Acme should pay?");
    expect(p).toContain("Peers trade at 18x.");
    expect(p).toContain("US$360m");
  });

  it("forbids inventing data or giving the answer away, and asks for JSON", () => {
    expect(p).toMatch(/only.*(facts|information).*(listed|below)/i);
    expect(p).toMatch(/never (give|reveal|state) the answer/i);
    expect(p).toMatch(/json/i);
  });

  it("carries the bar for this kind of question", () => {
    expect(p).toMatch(/approach before calculating/i);
  });

  it("shows the next question - so it can tell when a candidate-led candidate has moved on - but not its answer", () => {
    const opening = buildTurnPrompt(sheet, startSession(sheet, t0), "My structure is...");
    expect(opening).toContain("What is the most Acme should pay?");
    expect(opening).not.toContain("Peers trade at 18x.");
    expect(opening).not.toContain("US$360m");
    expect(opening).toMatch(/already (answering|moved on)/i);
  });

  it("forbids repeating a nudge, so the case cannot get stuck", () => {
    expect(p).toMatch(/never repeat/i);
  });

  it("leaves reading the data to the candidate - the model has misread exhibits live", () => {
    expect(p).toMatch(/do not (state|draw) (comparisons|conclusions)/i);
  });

  it("leaves out later questions' answers - the interviewer only needs where we are", () => {
    expect(p).not.toContain("Buy below US$360m.");
  });

  it("tells the interviewer what the arithmetic check found, so it never has to do sums itself", () => {
    const withCheck = buildTurnPrompt(sheet, s, "It's 360m", { questionId: "math", expected: 360e6, heard: 360e6, correct: true });
    expect(withCheck).toMatch(/figure is correct/i);
    const wrong = buildTurnPrompt(sheet, s, "It's 300m", { questionId: "math", expected: 360e6, heard: 300e6, correct: false });
    expect(wrong).toMatch(/does not match/i);
  });
});

describe("debrief", () => {
  let s = startSession(sheet, t0);
  s = applyTurn(sheet, s, "Is there a growth goal?", { say: "8%.", advance: false }, at(1));
  s = applyTurn(sheet, s, "What is Beta's revenue? And margins?", { say: "Not relevant.", advance: false }, at(2));
  s = applyTurn(sheet, s, "Four buckets...", { say: "Good.", advance: true }, at(5));
  s = applyTurn(sheet, s, "360m", { say: "Right.", advance: true }, at(9), { questionId: "math", expected: 360e6, heard: 360e6, correct: true });

  it("measures what can be measured without a model", () => {
    const sig = caseSignals(sheet, s);
    expect(sig.clarifyingQuestions).toBe(3); // "...goal?", "...revenue?", "And margins?"
    expect(sig.mathCorrect).toBe(1);
    expect(sig.mathTotal).toBe(1);
    expect(sig.questionsReached).toBe(3);
    expect(sig.minutes).toBe(9);
  });

  it("asks for a score on every dimension against the case's own answers", () => {
    const p = buildDebriefPrompt(sheet, s, caseSignals(sheet, s));
    for (const d of CASE_DIMENSIONS) expect(p).toContain(d);
    expect(p).toContain("Buy below US$360m.");
    expect(p).toContain("candidate: Four buckets...");
  });

  it("parses scores clamped to 1-5 and keeps feedback lists short", () => {
    const d = parseDebrief({
      scores: { structure: 9, analytics: 4, creativity: "3", judgement: 3, synthesis: 2, drive: 0 },
      strengths: ["a", "b", "c", "d", "e"],
      improvements: ["x"],
      perQuestion: [{ questionId: "math", note: "Clean." }],
    });
    expect(d.scores).toMatchObject({ structure: 5, creativity: 3, drive: 1 });
    expect(d.strengths).toHaveLength(4);
    expect(d.perQuestion[0]).toEqual({ questionId: "math", note: "Clean." });
  });

  it("rejects a debrief missing a dimension", () => {
    expect(() => parseDebrief({ scores: { structure: 3 }, strengths: [], improvements: [] })).toThrow();
  });
});
