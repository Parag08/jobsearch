import { describe, it, expect } from "vitest";
import { cannedText, lexicalExtract } from "./canned";
import { parseTurnReply, parseDebrief, CASE_DIMENSIONS } from "../interview/case-session";
import { parseFollowUp, parseMockDebrief, startMock } from "../interview/mock";
import { guardRewrite } from "../interview/model-answer";
import { SCORE_DIMENSIONS } from "../interview/score";
import { JdExtractSchema } from "../types";

const json = (s: string) => JSON.parse(s) as unknown;

describe("cannedText", () => {
  it("gives the case interviewer a line the turn parser accepts, and never ends the question itself", () => {
    const r = parseTurnReply(json(cannedText("case-turn", { turn: 3 })));
    expect(r.say.length).toBeGreaterThan(10);
    expect(r.advance).toBe(false);
  });

  it("scores a case on every dimension, with a note per question", () => {
    const d = parseDebrief(json(cannedText("case-debrief", { questionIds: ["q1", "q2"] })));
    for (const dim of CASE_DIMENSIONS) expect(d.scores[dim]).toBeGreaterThanOrEqual(1);
    expect(d.perQuestion.map((p) => p.questionId)).toEqual(["q1", "q2"]);
  });

  it("phrases the follow-up the code chose", () => {
    const f = parseFollowUp(json(cannedText("mock-turn", { candidates: ["ownership", "numbers"] })), ["ownership", "numbers"]);
    expect(f.probe).toBe("ownership");
  });

  it("gives a full mock debrief: every score, verdicts for the probes asked, a comparison when there is a model answer", () => {
    const s = startMock(
      { id: "q", text: "Tell me about a time you led without authority.", lookFor: "ownership", competency: "leadership" } as never,
      { tone: "neutral", maxFollowUps: 2 },
      "2026-11-19T00:00:00Z",
    );
    const raw = json(cannedText("mock-feedback", { probes: [], hasModelAnswer: true, words: 220 }));
    const d = parseMockDebrief(raw, s);
    for (const dim of SCORE_DIMENSIONS) expect(d.scores[dim]).toBeGreaterThanOrEqual(1);
    expect(d.strengths.length).toBeGreaterThan(0);
    expect(d.comparison?.covered.length).toBeGreaterThan(0);
  });

  it("rewrites a model answer from the draft alone, so the number guard passes", () => {
    const draft = "Situation: Checkout was failing for 12% of users.\nAction: I rebuilt the retry flow.\nResult: Failures fell to 3%.";
    const out = cannedText("model-answer", { draft });
    expect(guardRewrite(draft, out).ok).toBe(true);
    expect(out).not.toMatch(/Situation:/);
  });

  it("returns plain prose for the letter, the plan and the probe questions", () => {
    const letter = cannedText("cover-letter", {});
    expect(letter.split("\n\n")).toHaveLength(3);
    const words = letter.split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(330);
    expect(words).toBeLessThanOrEqual(450);
    expect(cannedText("role-plan", {})).toMatch(/week/i);
    expect(cannedText("probe", {}).split("\n").length).toBe(4);
  });
});

describe("lexicalExtract", () => {
  const taxonomy = { families: {}, tags: { roadmap: ["roadmap"], "data-analysis": ["sql", "analytics"] } };

  it("reads company, role, skills and city without a model", () => {
    const jd = "Senior Product Manager\nCompany: Lumen Bank\nOwn the roadmap for payments in Singapore. Strong SQL and analytics.";
    const e = JdExtractSchema.parse(lexicalExtract(jd, taxonomy));
    expect(e.role).toBe("Senior Product Manager");
    expect(e.company).toBe("Lumen Bank");
    expect(e.skills).toEqual(expect.arrayContaining(["roadmap", "data-analysis"]));
    expect(e.location).toBe("Singapore");
    expect(e.seniority).toBe("senior");
  });

  it("falls back to a placeholder company when the posting names none", () => {
    expect(lexicalExtract("Product Lead\nBuild things for a while in a nice team that ships.", taxonomy).company).toBe("Sample company");
  });
});
