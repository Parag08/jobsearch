import { describe, it, expect } from "vitest";
import { fullInterviewSettingsFromEnv, planFromBank, planFromJob, planFromRoleQuestions, topicKindOf } from "./full-plan";
import type { RoleQuestion } from "./role-questions";
import type { Question } from "./questions";

const rq = (id: string, text: string, extra: Partial<RoleQuestion> = {}): RoleQuestion => ({
  id: `role:${id}`,
  group: "company",
  competency: "Technical depth",
  text,
  lookFor: "a strong answer",
  firms: [],
  company: "Cognition",
  short: text.slice(0, 30),
  context: `brief ${id}`,
  round: "Technical interview, 24 Nov",
  interviewer: "a Deployed Engineer at Cognition",
  source: null,
  contextLabel: "Interview brief",
  ...extra,
});

describe("topicKindOf", () => {
  it("first question opens, a questions-for-us question closes, the rest are topics", () => {
    expect(topicKindOf("Walk me through your background.", 0)).toBe("opener");
    expect(topicKindOf("What questions do you have for me?", 5)).toBe("close");
    expect(topicKindOf("Do you have any questions for us?", 3)).toBe("close");
    expect(topicKindOf("Why Cognition?", 2)).toBe("topic");
  });
});

describe("planFromRoleQuestions", () => {
  it("keeps the pushed order, the persona and the round, and puts the close last", () => {
    const plan = planFromRoleQuestions(
      { id: "app1", company: "Cognition", role: "Deployed Engineer" },
      [rq("a", "Walk me through your background."), rq("q", "What questions do you have for me?"), rq("b", "Why Cognition?")],
    );
    expect(plan.source).toBe("role");
    expect(plan.interviewer).toBe("a Deployed Engineer at Cognition");
    expect(plan.round).toBe("Technical interview, 24 Nov");
    expect(plan.topics.map((t) => [t.id, t.kind])).toEqual([
      ["role:a", "opener"],
      ["role:b", "topic"],
      ["role:q", "close"],
    ]);
    expect(plan.topics[0].context).toBe("brief a");
  });

  it("refuses an empty set", () => {
    expect(() => planFromRoleQuestions({ id: "a", company: "X", role: "Y" }, [])).toThrow();
  });
});

describe("planFromJob", () => {
  it("company questions first, then bank questions for the competencies the job calls for, capped", () => {
    const company = [
      { id: "company:x:why", text: "Why X?", competency: "motivation", lookFor: "l", group: "company", firms: [], company: "X", short: "Why X?", context: "Role applied for: PM." },
    ];
    const bank: Question[] = [
      { id: "lead-1", group: "g", competency: "leadership", text: "Tell me about leading.", lookFor: "l", firms: [] },
      { id: "fail-1", group: "g", competency: "failure", text: "Tell me about failing.", lookFor: "l", firms: [] },
      { id: "lead-2", group: "g", competency: "leadership", text: "Another leading.", lookFor: "l", firms: [] },
    ];
    const plan = planFromJob({ id: "app1", company: "X", role: "PM" }, company, bank, ["leadership"], 2);
    expect(plan.source).toBe("job");
    expect(plan.interviewer).toBeNull();
    expect(plan.topics.map((t) => t.id)).toEqual(["company:x:why", "lead-1", "lead-2"]);
    expect(plan.topics[0].kind).toBe("opener");
  });
});

describe("fullInterviewSettingsFromEnv", () => {
  const env = { INTERVIEW_FULL_MAX_TOPICS: "8", INTERVIEW_FULL_TOPIC_FOLLOW_UPS: "3", INTERVIEW_FULL_TOTAL_FOLLOW_UPS: "12" };
  it("reads all three", () => {
    expect(fullInterviewSettingsFromEnv(env)).toEqual({ maxTopics: 8, topicFollowUps: 3, totalFollowUps: 12 });
  });
  it("is off (null) when any is unset - no made-up default", () => {
    expect(fullInterviewSettingsFromEnv({ ...env, INTERVIEW_FULL_MAX_TOPICS: undefined })).toBeNull();
  });
  it("throws on a value that is not a whole number", () => {
    expect(() => fullInterviewSettingsFromEnv({ ...env, INTERVIEW_FULL_TOPIC_FOLLOW_UPS: "two" })).toThrow(/INTERVIEW_FULL_TOPIC_FOLLOW_UPS/);
    expect(() => fullInterviewSettingsFromEnv({ ...env, INTERVIEW_FULL_MAX_TOPICS: "1" })).toThrow(/INTERVIEW_FULL_MAX_TOPICS/);
  });
});

describe("planFromBank (general practice, no company)", () => {
  const q = (id: string, group: string): Question => ({ id, group, competency: group, text: `${id}?`, lookFor: "l", firms: [] });
  const bank = [q("fit-1", "fit"), q("fit-2", "fit"), q("team-1", "team"), q("team-2", "team"), q("fail-1", "fail"), q("data-1", "data")];

  it("opens on the bank's first question, then one per other group, unpractised groups first, weakest next", () => {
    const best = new Map([
      ["team-1", 4.5],
      ["fail-1", 2.1],
    ]);
    const plan = planFromBank(bank, best, 10);
    expect(plan.source).toBe("general");
    expect(plan.applicationId).toBeNull();
    expect(plan.topics.map((t) => t.id)).toEqual(["fit-1", "data-1", "fail-1", "team-2"]);
    expect(plan.topics[0].kind).toBe("opener");
  });

  it("caps the plan a little above what one interview asks", () => {
    expect(planFromBank(bank, new Map(), 2).topics).toHaveLength(4);
  });
});
