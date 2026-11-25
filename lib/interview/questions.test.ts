import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseQuestionBank, QUESTION_BANK_PATH } from "./questions";

describe("parseQuestionBank", () => {
  it("rejects duplicate ids, since answers are keyed by question id", () => {
    expect(() =>
      parseQuestionBank({
        groups: [{ id: "g", label: "G" }],
        questions: [
          { id: "dup", group: "g", competency: "c", text: "a", firms: [], lookFor: "x" },
          { id: "dup", group: "g", competency: "c", text: "b", firms: [], lookFor: "x" },
        ],
      }),
    ).toThrow(/duplicate/i);
  });

  it("rejects a question pointing at a group that does not exist", () => {
    expect(() =>
      parseQuestionBank({
        groups: [{ id: "g", label: "G" }],
        questions: [{ id: "q", group: "nope", competency: "c", text: "a", firms: [], lookFor: "x" }],
      }),
    ).toThrow(/group/i);
  });

  it("ignores the _readme key, like the other seed files", () => {
    expect(() =>
      parseQuestionBank({ _readme: ["hello"], groups: [], questions: [] }),
    ).not.toThrow();
  });
});

describe("the shipped question bank", () => {
  // Guards the data file itself: a bad edit to questions.json fails the build rather
  // than breaking the interview tab at runtime.
  const raw = JSON.parse(readFileSync(resolve(QUESTION_BANK_PATH), "utf8"));
  const shipped = parseQuestionBank(raw);

  it("parses", () => {
    expect(shipped.questions.length).toBeGreaterThan(15);
  });

  it("covers the two competencies an MBB interviewer is near-certain to probe", () => {
    const competencies = new Set(shipped.questions.map((q) => q.competency));
    expect(competencies.has("failure")).toBe(true);
    expect(competencies.has("conflict")).toBe(true);
  });

  it("has the everyday basics any interviewer opens with", () => {
    const ids = new Set(shipped.questions.map((q) => q.id));
    for (const id of ["fit-about-yourself", "fit-strengths", "fit-weakness", "fit-why-mba", "fit-aspirations"]) {
      expect(ids.has(id), id).toBe(true);
    }
    // The opener comes first: it is the question the tab opens on.
    expect(shipped.questions[0].id).toBe("fit-about-yourself");
  });

  it("has Bain questions, since that is the firm being prepared for", () => {
    expect(shipped.questions.filter((q) => q.firms.includes("bain")).length).toBeGreaterThan(15);
  });
});
