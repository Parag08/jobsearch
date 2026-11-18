import { describe, it, expect } from "vitest";
import type { Application } from "../types";
import {
  ROLE_QUESTION_LIMITS,
  RoleInterviewInputSchema,
  isRoleQuestionId,
  roleQuestionId,
  roleQuestions,
  storedRoleIdOf,
  type StoredRoleQuestion,
} from "./role-questions";

const app = (over: Partial<Application> = {}): Application =>
  ({
    id: "app-1",
    company: "Cognition",
    role: "Deployed Engineer",
    stage: "interview",
    closedReason: null,
    updatedAt: "2026-11-18T00:00:00Z",
    ...over,
  }) as Application;

const stored = (over: Partial<StoredRoleQuestion> = {}): StoredRoleQuestion => ({
  id: "row-1",
  applicationId: "app-1",
  externalRef: "cognition-de:deep-dive",
  round: "Technical interview",
  interviewer: "a Deployed Engineer at Cognition",
  position: 0,
  competency: "Technical depth",
  text: "Walk me through something technically impressive that you built.",
  short: "Technical deep-dive",
  lookFor: "Business problem first, then the design choice, trade-off and result.",
  context: "Reported by candidates in 2026.",
  source: "Aced candidate report",
  modelAnswer: "I took over a stalled feature and shipped it.",
  updatedAt: "2026-11-18T00:00:00Z",
  ...over,
});

describe("role question ids", () => {
  it("round-trips the stored row id", () => {
    expect(roleQuestionId("abc")).toBe("role:abc");
    expect(isRoleQuestionId("role:abc")).toBe(true);
    expect(isRoleQuestionId("company:x:why")).toBe(false);
    expect(storedRoleIdOf("role:abc")).toBe("abc");
    expect(storedRoleIdOf("role:")).toBeNull();
    expect(storedRoleIdOf("custom:abc")).toBeNull();
  });
});

describe("roleQuestions", () => {
  it("attaches each question to its application's company, in position order", () => {
    const qs = roleQuestions(
      [stored({ id: "b", position: 2, text: "Second?" }), stored({ id: "a", position: 1, text: "First?" })],
      [app()],
    );
    expect(qs.map((q) => q.id)).toEqual(["role:a", "role:b"]);
    expect(qs[0]).toMatchObject({
      group: "company",
      company: "Cognition",
      text: "First?",
      short: "Technical deep-dive",
      round: "Technical interview",
      interviewer: "a Deployed Engineer at Cognition",
      contextLabel: "Interview brief",
      firms: [],
    });
    expect(qs[0].context).toBe("Reported by candidates in 2026.");
    expect(qs[0].modelAnswer).toBe("I took over a stalled feature and shipped it.");
  });

  it("falls back to the question text for the list label", () => {
    const [q] = roleQuestions([stored({ short: null })], [app()]);
    expect(q.short).toBe(q.text);
  });

  it("leaves out questions whose application is closed or gone", () => {
    expect(roleQuestions([stored()], [app({ closedReason: "lost" })])).toEqual([]);
    expect(roleQuestions([stored()], [])).toEqual([]);
  });
});

describe("RoleInterviewInputSchema", () => {
  const question = {
    externalRef: "cognition-de:deep-dive",
    competency: "Technical depth",
    text: "Walk me through a project.",
    lookFor: "Depth and ownership.",
  };

  it("accepts a set for one application", () => {
    const r = RoleInterviewInputSchema.parse({ externalRef: "cognition-fde", round: "Technical", questions: [question] });
    expect(r.questions).toHaveLength(1);
  });

  it("needs an application reference and at least one question", () => {
    expect(() => RoleInterviewInputSchema.parse({ questions: [question] })).toThrow();
    expect(() => RoleInterviewInputSchema.parse({ externalRef: "x", questions: [] })).toThrow();
  });

  it("refuses text over the limits rather than cutting it", () => {
    const long = "x".repeat(ROLE_QUESTION_LIMITS.text + 1);
    expect(() => RoleInterviewInputSchema.parse({ externalRef: "x", questions: [{ ...question, text: long }] })).toThrow();
    const many = Array.from({ length: ROLE_QUESTION_LIMITS.perSet + 1 }, (_, i) => ({ ...question, externalRef: `q${i}` }));
    expect(() => RoleInterviewInputSchema.parse({ externalRef: "x", questions: many })).toThrow();
  });

  it("refuses the same question ref twice in one set", () => {
    expect(() => RoleInterviewInputSchema.parse({ externalRef: "x", questions: [question, question] })).toThrow(/twice/);
  });
});
