import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { firmNote, groupQuestions, parseQuestionBank, questionsForFirm, QUESTION_BANK_PATH } from "./questions";

const bank = parseQuestionBank({
  groups: [
    { id: "fit", label: "Fit" },
    { id: "team", label: "Team" },
    { id: "empty", label: "Nothing here" },
  ],
  questions: [
    { id: "q1", group: "fit", competency: "fit", text: "Why consulting?", firms: ["bain", "bcg"], lookFor: "a reason" },
    { id: "q2", group: "team", competency: "leadership", text: "Led a team?", firms: ["bain"], lookFor: "you", bain: "team culture" },
    { id: "q3", group: "fit", competency: "fit", text: "Why McKinsey?", firms: ["mckinsey"], lookFor: "a person" },
  ],
});

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

describe("questionsForFirm", () => {
  it("filters to a firm", () => {
    expect(questionsForFirm(bank, "bain").map((q) => q.id)).toEqual(["q1", "q2"]);
  });

  it("returns everything for 'all'", () => {
    expect(questionsForFirm(bank, "all")).toHaveLength(3);
  });
});

describe("groupQuestions", () => {
  it("keeps the bank's group order and drops groups with nothing in them", () => {
    const grouped = groupQuestions(bank, bank.questions);
    expect(grouped.map((g) => g.group.id)).toEqual(["fit", "team"]);
    expect(grouped[0].questions.map((q) => q.id)).toEqual(["q1", "q3"]);
  });
});

describe("firmNote", () => {
  it("returns the firm-specific advice when there is one", () => {
    expect(firmNote(bank.questions[1], "bain")).toBe("team culture");
  });

  it("returns null rather than inventing advice", () => {
    expect(firmNote(bank.questions[0], "bain")).toBeNull();
    expect(firmNote(bank.questions[1], "all")).toBeNull();
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

  it("has Bain questions, since that is the firm being prepared for", () => {
    expect(questionsForFirm(shipped, "bain").length).toBeGreaterThan(15);
  });
});
