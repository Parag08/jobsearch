import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { handleMessage } from "./server";
import type { ToolContext } from "./tools";
import { createFullSession, finishFullSession } from "../repos/full-sessions";
import { fullPlanFor } from "../services/full-interview";
import { applyFullTurn, startFull } from "../interview/full-session";

/** Full interviews and role-plays over MCP (docs/FULL-INTERVIEW.md section 4). */

const NOW = "2026-11-20T02:00:00.000Z";
const ctxFor = (db: FakeDb, userId = "user-1"): ToolContext => ({ db, userId, nowIso: NOW, scope: "write", customQuestionMaxChars: 300 });

async function call(ctx: ToolContext, name: string, args: unknown = {}) {
  const res = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, ctx);
  const result = res!.result as { content: { text: string }[]; isError: boolean };
  return { isError: result.isError, text: result.content[0].text, data: result.isError ? null : JSON.parse(result.content[0].text) };
}

const MODEL = "I led the files migration. We moved 10 PB in six phases.";
const PLAY = [
  { who: "interviewer", say: "Walk me through it." },
  { who: "candidate", say: "I led the files migration and we moved 10 PB.", why: "Result first." },
  { who: "interviewer", say: "Why six phases?" },
  { who: "candidate", say: "So each phase could be rolled back.", why: "Gives the reason." },
];

async function setup() {
  const db = new FakeDb();
  const ctx = ctxFor(db);
  await call(ctx, "upsert_application", { externalRef: "cog", company: "Cognition", role: "DE" });
  const up = await call(ctx, "upsert_interview_questions", {
    externalRef: "cog",
    interviewer: "a Deployed Engineer at Cognition",
    questions: [
      { externalRef: "cog:bg", competency: "Motivation", text: "Walk me through your background.", lookFor: "arc" },
      { externalRef: "cog:deep", competency: "Technical depth", text: "Walk me through something you built.", lookFor: "depth", modelAnswer: MODEL, rolePlay: PLAY },
    ],
  });
  return { db, ctx, up };
}

describe("role-plays over MCP", () => {
  it("upsert_interview_questions stores a role-play with the question, checked against its model answer", async () => {
    const { ctx, up } = await setup();
    expect(up.isError).toBe(false);
    expect(up.data.rolePlays).toEqual({ saved: 1, keptApp: [], refused: [] });
    const deep = (await call(ctx, "list_interview_practice", { externalRef: "cog" })).data.questions[1];
    expect(deep.rolePlay).toMatchObject({ source: "agent", stale: false });
    expect(deep.rolePlay.lines[0].say).toBe("Walk me through something you built.");
  });

  it("set_role_play saves one for any question, and refuses invented numbers and an unconfirmed force", async () => {
    const { ctx } = await setup();
    const [, { questionId }] = (await call(ctx, "list_interview_questions", { externalRef: "cog" })).data.questions;
    expect((await call(ctx, "set_role_play", { questionId, lines: PLAY })).data).toEqual({ saved: true });
    const bad = await call(ctx, "set_role_play", { questionId, lines: [PLAY[0], { who: "candidate", say: "We moved 99 PB." }, PLAY[2], PLAY[3]] });
    expect(bad.isError).toBe(true);
    expect(bad.text).toMatch(/99/);
    const forced = await call(ctx, "set_role_play", { questionId, lines: PLAY, force: true });
    expect(forced.isError).toBe(true);
    expect(forced.text).toMatch(/confirmedByUser/);
    expect((await call(ctx, "set_role_play", { questionId: "role:nope", lines: PLAY })).isError).toBe(true);
  });
});

describe("full interviews in list_interview_practice", () => {
  it("returns an application's full mock interviews with transcript, path and debrief; never another user's", async () => {
    const { db, ctx } = await setup();
    const apps = (await call(ctx, "list_applications")).data.applications;
    const settings = { maxTopics: 4, topicFollowUps: 1, totalFollowUps: 2 };
    const plan = (await fullPlanFor(db, "user-1", apps[0].id, settings))!;
    let s = startFull(plan, settings, "neutral", NOW);
    s = applyFullTurn(s, "I started as an engineer and moved toward customers.", { move: "deepen", say: "Why customers?" }, NOW);
    const stored = await createFullSession(db, "user-1", s);
    await finishFullSession(db, "user-1", stored.id, {
      session: { ...s, status: "done" },
      scores: { structure: 4, ownership: 3, specificity: 3, impact: 3, reflection: 2, relevance: 4 },
      overall: 3.2,
      strengths: ["a"],
      improvements: ["b"],
      perTopic: [{ topicId: plan.topics[0].id, verdict: "partial", note: "n" }],
      moments: [],
      model: "m",
    });
    const r = (await call(ctx, "list_interview_practice", { externalRef: "cog" })).data;
    expect(r.fullInterviews).toHaveLength(1);
    expect(r.fullInterviews[0]).toMatchObject({ status: "done", overall: 3.2, company: "Cognition", path: [{ topic: "Walk me through your background.", moves: ["deepen"] }] });
    expect(r.fullInterviews[0].transcript).toContain("Why customers?");
    expect((await call(ctxFor(db, "user-2"), "list_interview_practice", { since: "2026-01-01" })).data.fullInterviews).toEqual([]);
  });
});
