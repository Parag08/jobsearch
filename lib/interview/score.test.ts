import { describe, it, expect } from "vitest";
import {
  buildScoringPrompt,
  deliverySignals,
  numberDrift,
  overallScore,
  parseScore,
  SCORE_DIMENSIONS,
} from "./score";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

describe("deliverySignals", () => {
  it("counts words and pace from the recording length", () => {
    const s = deliverySignals(words(300), 120);
    expect(s.words).toBe(300);
    expect(s.wordsPerMinute).toBe(150);
    expect(s.pace).toBe("good");
  });

  it("flags an answer that is too short to carry a STAR story", () => {
    expect(deliverySignals(words(40), 20).pace).toBe("too-short");
  });

  it("flags an answer that runs long - interviewers stop listening", () => {
    expect(deliverySignals(words(700), 300).pace).toBe("too-long");
  });

  it("falls back to word count when there is no recording length", () => {
    const s = deliverySignals(words(300));
    expect(s.durationSeconds).toBeNull();
    expect(s.wordsPerMinute).toBeNull();
    expect(s.pace).toBe("good");
  });

  it("measures ownership - how much is 'I' versus 'we'", () => {
    const s = deliverySignals("We decided. We built it. I proposed the hub network and I sold it to the CEO.");
    expect(s.iCount).toBe(2);
    expect(s.weCount).toBe(2);
    expect(s.ownershipRatio).toBe(0.5);
  });

  it("does not count 'I' inside other words", () => {
    expect(deliverySignals("Initially it involved IT.").iCount).toBe(0);
  });

  it("reports null ownership rather than a fake ratio when neither is used", () => {
    expect(deliverySignals("The project shipped on time.").ownershipRatio).toBeNull();
  });
});

describe("numberDrift", () => {
  it("catches a number said aloud that the written answer does not contain", () => {
    const d = numberDrift("We cut fleet cost by about 40 percent", "Sized two strategies worth up to 30%");
    expect(d.saidNotWritten).toContain("40");
  });

  it("does not flag a number that matches in a different form", () => {
    const d = numberDrift("cut it by 30%", "worth up to 30 percent");
    expect(d.saidNotWritten).toEqual([]);
  });

  it("is empty when there is no written answer to compare against", () => {
    expect(numberDrift("cut it by 30%", "").saidNotWritten).toEqual([]);
  });
});

describe("buildScoringPrompt", () => {
  const prompt = buildScoringPrompt({
    question: "Tell me about a time you failed.",
    lookFor: "A genuine failure.",
    firmNote: "Bain values candour.",
    transcript: "I missed a deadline.",
  });

  it("includes the question, the rubric and the transcript", () => {
    expect(prompt).toContain("Tell me about a time you failed.");
    expect(prompt).toContain("A genuine failure.");
    expect(prompt).toContain("I missed a deadline.");
    for (const d of SCORE_DIMENSIONS) expect(prompt).toContain(d);
  });

  it("forbids the scorer from rewarding or inventing content that was not said", () => {
    expect(prompt).toMatch(/only what is in the transcript/i);
    expect(prompt).toMatch(/do not invent/i);
  });

  it("asks for JSON, which the gateway's JSON mode requires the prompt to mention", () => {
    expect(prompt).toMatch(/json/i);
  });
});

describe("parseScore", () => {
  const good = {
    scores: { structure: 4, ownership: 3, specificity: 5, impact: 4, reflection: 2, relevance: 5 },
    strengths: ["Led with the result"],
    improvements: ["Say what you personally did"],
  };

  it("accepts a well-formed score", () => {
    expect(parseScore(good).scores.structure).toBe(4);
  });

  it("clamps out-of-range scores into 1-5 rather than trusting the model", () => {
    const s = parseScore({ ...good, scores: { ...good.scores, structure: 9, ownership: 0 } });
    expect(s.scores.structure).toBe(5);
    expect(s.scores.ownership).toBe(1);
  });

  it("coerces numeric strings, which some models return", () => {
    expect(parseScore({ ...good, scores: { ...good.scores, impact: "3" } }).scores.impact).toBe(3);
  });

  it("rejects a response missing a dimension - a partial score is a misleading score", () => {
    const { reflection: _r, ...partial } = good.scores;
    expect(() => parseScore({ ...good, scores: partial })).toThrow();
  });

  it("caps feedback lists so the UI stays readable", () => {
    const s = parseScore({ ...good, improvements: Array.from({ length: 12 }, (_, i) => `tip ${i}`) });
    expect(s.improvements.length).toBeLessThanOrEqual(4);
  });
});

describe("overallScore", () => {
  it("is the mean to one decimal place", () => {
    expect(overallScore({ structure: 4, ownership: 3, specificity: 5, impact: 4, reflection: 2, relevance: 5 })).toBe(3.8);
  });
});
