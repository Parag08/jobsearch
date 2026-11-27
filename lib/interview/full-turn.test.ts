import { describe, it, expect } from "vitest";
import { AiCallLimitError, LlmHttpError } from "../adapters/llm-http";
import type { FullPlan } from "./full-plan";
import { startFull, type FullSession } from "./full-session";
import { chooseFullReply } from "./full-turn";
import type { InterviewerModel } from "./interviewer-model";

const plan: FullPlan = {
  applicationId: null,
  company: "",
  role: "",
  source: "general",
  round: null,
  interviewer: null,
  contextLabel: "Context",
  topics: [
    { id: "t1", kind: "topic", competency: "Impact", text: "Tell me about something you built.", short: "Built", lookFor: "depth", context: null },
    { id: "t2", kind: "topic", competency: "Failure", text: "Tell me about a failure.", short: "Failure", lookFor: "honesty", context: null },
  ],
};
const s: FullSession = startFull(plan, { maxTopics: 2, topicFollowUps: 2, totalFollowUps: 3 }, "neutral", "2026-11-23T00:00:00Z");
const latest = "I built the billing service and moved it to queues.";
const legal = ["deepen", "next:t2"];
const models: InterviewerModel[] = [
  { model: "a/first", maxOutputTokens: 2000, reasoningEffort: "low" },
  { model: "b/premium", maxOutputTokens: 160 },
];

describe("chooseFullReply (one turn, shared by the app and the eval)", () => {
  it("asks no model when only one move is legal", async () => {
    let calls = 0;
    const got = await chooseFullReply({ session: s, latest, legal: ["next:t2"] }, models, async () => (calls++, "{}"));
    expect(calls).toBe(0);
    expect(got).toMatchObject({ model: "code", raw: null, reply: { move: "next:t2" } });
  });

  it("returns the first model's guarded reply, and its raw line before the guards", async () => {
    const got = await chooseFullReply({ session: s, latest, legal }, models, async (m) =>
      m.model === "a/first" ? JSON.stringify({ move: "deepen", say: "Great answer! You said queues. Why queues?" }) : "",
    );
    expect(got.model).toBe("a/first");
    expect(got.raw).toEqual({ move: "deepen", say: "Great answer! You said queues. Why queues?" });
    expect(got.reply).toMatchObject({ move: "deepen", say: "You said queues. Why queues?" });
  });

  it("tries the next model when one fails, and reports the failure", async () => {
    const failed: string[] = [];
    const got = await chooseFullReply(
      { session: s, latest, legal },
      models,
      async (m) => {
        if (m.model === "a/first") throw new Error("boom");
        return JSON.stringify({ move: "next:t2", say: "" });
      },
      (m) => failed.push(m),
    );
    expect(failed).toEqual(["a/first"]);
    expect(got).toMatchObject({ model: "b/premium", reply: { move: "next:t2" } });
  });

  it("stops at once on a rate limit, so the caller can ask to wait", async () => {
    await expect(
      chooseFullReply({ session: s, latest, legal }, models, async () => {
        throw new LlmHttpError("gateway", 429, "Retry after 7s");
      }),
    ).rejects.toBeInstanceOf(LlmHttpError);
  });

  it("stops at once at the user's AI call limit, rather than a silent stock line", async () => {
    let calls = 0;
    await expect(
      chooseFullReply({ session: s, latest, legal }, models, async () => {
        calls += 1;
        throw new AiCallLimitError(60);
      }),
    ).rejects.toBeInstanceOf(AiCallLimitError);
    expect(calls).toBe(1);
  });

  it("falls back to code when every model fails", async () => {
    const got = await chooseFullReply({ session: s, latest, legal }, models, async () => {
      throw new Error("down");
    });
    expect(got.model).toBe("code");
    expect(got.raw).toBeNull();
    expect(legal).toContain(got.reply.move);
  });
});
