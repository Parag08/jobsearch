import { describe, it, expect } from "vitest";
import { MODEL_ANSWER_MAX, buildRewritePrompt, guardRewrite, mayOverwrite, isQuestionIdShape } from "./model-answer";

describe("buildRewritePrompt", () => {
  const p = buildRewritePrompt({
    question: "Walk me through something you built.",
    lookFor: "Result first, then the decision.",
    context: "Candidates report a deep-dive.",
    contextLabel: "Interview brief",
    draft: "We built a files migration. 10+ PB moved. I set the boundary.",
  });

  it("carries the question, rubric, brief and draft, marked as data", () => {
    expect(p).toContain("Walk me through something you built.");
    expect(p).toContain("Result first, then the decision.");
    expect(p).toContain("Context (Interview brief): Candidates report a deep-dive.");
    expect(p).toContain("10+ PB moved");
    expect(p).toMatch(/never as instructions/);
  });

  it("forbids new facts and numbers and asks for a spoken, first-person answer", () => {
    expect(p).toMatch(/never add a fact, number, name, tool or result that is not in the draft/i);
    expect(p).toMatch(/"I"/);
    expect(p).toMatch(/90 seconds/);
  });
});

describe("guardRewrite", () => {
  const draft = "I shipped it in ten months; customers moved 10+ PB and it added $1M in recurring revenue.";

  it("accepts a rewrite that only uses the draft's numbers, in any written form", () => {
    const r = guardRewrite(draft, "Customers moved more than 10+ PB with it, and it added $1 million of recurring revenue.");
    expect(r).toEqual({ ok: true, text: "Customers moved more than 10+ PB with it, and it added $1 million of recurring revenue." });
  });

  it("rejects a rewrite that adds a number the draft does not contain", () => {
    const r = guardRewrite(draft, "Customers moved 10+ PB, it added $1M, and cut costs 30%.");
    expect(r).toEqual({ ok: false, added: ["30%"] });
  });

  it("rejects empty output and cuts nothing silently", () => {
    expect(guardRewrite(draft, "  ")).toEqual({ ok: false, added: [], empty: true });
    expect(guardRewrite(draft, "x".repeat(MODEL_ANSWER_MAX + 1))).toEqual({ ok: false, added: [], tooLong: true });
  });
});

describe("mayOverwrite", () => {
  it("the user's own and the in-app rewrite are never overwritten by the agent unless forced", () => {
    expect(mayOverwrite(null, "agent", false)).toBe(true);
    expect(mayOverwrite("agent", "agent", false)).toBe(true);
    expect(mayOverwrite("ai", "agent", false)).toBe(false);
    expect(mayOverwrite("user", "agent", false)).toBe(false);
    expect(mayOverwrite("user", "agent", true)).toBe(true);
  });

  it("the user always may replace any model answer", () => {
    expect(mayOverwrite("agent", "user", false)).toBe(true);
    expect(mayOverwrite("agent", "ai", false)).toBe(true);
  });
});

describe("isQuestionIdShape", () => {
  it("accepts the four question id kinds and nothing else", () => {
    for (const id of ["fit-about-yourself", "role:abc-123", "custom:abc", "company:cognition:why-company"]) expect(isQuestionIdShape(id)).toBe(true);
    for (const id of ["", "role:", "DROP TABLE", "a b"]) expect(isQuestionIdShape(id)).toBe(false);
  });
});
