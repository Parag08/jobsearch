import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
import { FakeLlm } from "../adapters/llm";
import type { JdExtract } from "../types";
import { handleBody, handleMessage, PROTOCOL_VERSIONS } from "./server";
import { TOOLS, type ToolContext } from "./tools";

const ctxFor = (db: FakeDb, userId = "user-1"): ToolContext => ({ db, userId, nowIso: "2026-11-13T02:00:00.000Z" });
const rpc = (method: string, params?: unknown, id: number | string = 1) => ({ jsonrpc: "2.0", id, method, params });

async function call(ctx: ToolContext, name: string, args: unknown = {}) {
  const res = await handleMessage(rpc("tools/call", { name, arguments: args }), ctx);
  const result = res!.result as { content: { text: string }[]; isError: boolean };
  return { isError: result.isError, text: result.content[0].text, data: result.isError ? null : JSON.parse(result.content[0].text) };
}

describe("MCP protocol", () => {
  it("initializes, echoing a version it speaks and offering its newest otherwise", async () => {
    const ctx = ctxFor(new FakeDb());
    const known = await handleMessage(rpc("initialize", { protocolVersion: "2025-03-26" }), ctx);
    expect(known!.result).toMatchObject({ protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "jobsearch" } });
    const unknown = await handleMessage(rpc("initialize", { protocolVersion: "1999-01-01" }), ctx);
    expect((unknown!.result as { protocolVersion: string }).protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
  });

  it("answers ping, ignores notifications, and rejects unknown methods and malformed messages", async () => {
    const ctx = ctxFor(new FakeDb());
    expect((await handleMessage(rpc("ping"), ctx))!.result).toEqual({});
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx)).toBeNull();
    expect((await handleMessage(rpc("resources/list"), ctx))!.error!.code).toBe(-32601);
    expect((await handleMessage({ id: 1, method: "ping" }, ctx))!.error!.code).toBe(-32600);
    expect((await handleMessage("nope", ctx))!.error!.code).toBe(-32600);
  });

  it("lists every tool with a name, a description and an object schema", async () => {
    const res = await handleMessage(rpc("tools/list"), ctxFor(new FakeDb()));
    const tools = (res!.result as { tools: { name: string; description: string; inputSchema: { type: string } }[] }).tools;
    expect(tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("handles a batch, dropping notifications; an all-notification batch has no reply", async () => {
    const ctx = ctxFor(new FakeDb());
    const out = await handleBody([rpc("ping", undefined, "a"), { jsonrpc: "2.0", method: "notifications/initialized" }], ctx);
    expect(out).toEqual([{ jsonrpc: "2.0", id: "a", result: {} }]);
    expect(await handleBody([{ jsonrpc: "2.0", method: "notifications/initialized" }], ctx)).toBeNull();
  });
});

describe("MCP tools", () => {
  it("runs the whole loop: upsert, list, stage with evidence, summary", async () => {
    const ctx = ctxFor(new FakeDb());
    const made = await call(ctx, "upsert_application", { externalRef: "acme-pm", company: "Acme", role: "PM", jdRaw: "JD text", savedAt: "2026-10-20" });
    expect(made.data.created).toBe(true);
    expect(made.data.application.stage).toBe("saved");

    const staged = await call(ctx, "set_stage", { externalRef: "acme-pm", stage: "applied", date: "2026-10-21", evidence: "confirmed by the user 2026-10-21" });
    expect(staged.data.moved).toBe(true);

    const listed = await call(ctx, "list_applications", { stage: "applied" });
    expect(listed.data.count).toBe(1);
    expect(listed.text).not.toContain("JD text");

    const full = await call(ctx, "get_application", { externalRef: "acme-pm" });
    expect(full.data.jdRaw).toBe("JD text");

    const summary = await call(ctx, "pipeline_summary");
    expect(summary.data.byStage.applied).toBe(1);
    expect(summary.data.stale).toHaveLength(1); // applied 21 Oct, today 13 Nov
  });

  it("returns a readable tool error, not a protocol error, for bad arguments or missing evidence", async () => {
    const ctx = ctxFor(new FakeDb());
    await call(ctx, "upsert_application", { externalRef: "x", company: "Acme", role: "PM" });
    const noEvidence = await call(ctx, "set_stage", { externalRef: "x", stage: "applied", date: "2026-11-04" });
    expect(noEvidence.isError).toBe(true);
    expect(noEvidence.text).toMatch(/evidence/);
    const noRef = await call(ctx, "get_application", {});
    expect(noRef.isError).toBe(true);
    const unknown = await handleMessage(rpc("tools/call", { name: "drop_everything" }), ctx);
    expect(unknown!.error!.code).toBe(-32602);
  });

  it("scopes every tool to the caller: another user's token sees nothing and can change nothing", async () => {
    const db = new FakeDb();
    const mine = await call(ctxFor(db, "user-1"), "upsert_application", { externalRef: "x", company: "Acme", role: "PM" });
    await call(ctxFor(db, "user-1"), "upsert_contact", { externalRef: "li:jane", name: "Jane Tan", company: "Grab" });

    const theirs = ctxFor(db, "user-2");
    expect((await call(theirs, "list_applications")).data.count).toBe(0);
    expect((await call(theirs, "list_contacts")).data.count).toBe(0);
    expect((await call(theirs, "get_application", { id: mine.data.application.id })).isError).toBe(true);
    expect((await call(theirs, "set_stage", { id: mine.data.application.id, stage: "applied", date: "2026-11-04", evidence: "x" })).isError).toBe(true);
    expect((await call(theirs, "log_interaction", { externalRef: "li:jane", date: "2026-11-04", channel: "linkedin", summary: "hi" })).isError).toBe(true);
  });

  it("keeps contacts and their interactions", async () => {
    const ctx = ctxFor(new FakeDb());
    await call(ctx, "upsert_contact", { externalRef: "li:jane", name: "Jane Tan", company: "Grab", status: "awaiting-reply" });
    const first = await call(ctx, "log_interaction", { externalRef: "li:jane", date: "2026-10-28", channel: "linkedin", summary: "Connection note sent" });
    const again = await call(ctx, "log_interaction", { externalRef: "li:jane", date: "2026-10-28", channel: "linkedin", summary: "Connection note sent" });
    expect([first.data.created, again.data.created]).toEqual([true, false]);
    const got = await call(ctx, "get_contact", { externalRef: "li:jane" });
    expect(got.data.interactions).toHaveLength(1);
    expect((await call(ctx, "list_contacts", { company: "grab" })).data.count).toBe(1);
  });
});

const extract = (over: Partial<JdExtract> = {}): JdExtract => ({
  company: "Acme",
  role: "Forward Deployed Engineer",
  roleFamily: "forward-deployed-engineering",
  sectorPath: ["IT", "AI"],
  skills: ["python", "sql"],
  keywords: [],
  seniority: null,
  visaNote: null,
  location: null,
  ...over,
});
const JD = "We are hiring a forward deployed engineer to work with customers on python and sql pipelines.";

describe("MCP role reading and role_insights", () => {
  it("reads the posting into skills when a reader is configured", async () => {
    const llm = new FakeLlm();
    llm.stubJdExtract(extract());
    const ctx = { ...ctxFor(new FakeDb()), llm };
    const made = await call(ctx, "upsert_application", { externalRef: "acme-fde", company: "Acme", role: "FDE", jdRaw: JD });
    expect(made.data.skillsRead).toBe(true);
    expect(made.data.readError).toBeUndefined();
    const full = await call(ctx, "get_application", { externalRef: "acme-fde" });
    expect(full.data.jdExtract.skills).toEqual(["python", "sql"]);
  });

  it("saves the role with skillsRead false when no reader is configured", async () => {
    const ctx = ctxFor(new FakeDb());
    const made = await call(ctx, "upsert_application", { externalRef: "acme-fde", company: "Acme", role: "FDE", jdRaw: JD });
    expect(made.isError).toBe(false);
    expect(made.data.skillsRead).toBe(false);
    expect((await call(ctx, "list_applications")).data.count).toBe(1);
  });

  it("reports readError when the read fails, and still saves", async () => {
    const ctx = { ...ctxFor(new FakeDb()), llm: new FakeLlm() }; // nothing stubbed: extractJd throws
    const made = await call(ctx, "upsert_application", { externalRef: "acme-fde", company: "Acme", role: "FDE", jdRaw: JD });
    expect(made.data.skillsRead).toBe(false);
    expect(typeof made.data.readError).toBe("string");
    expect((await call(ctx, "list_applications")).data.count).toBe(1);
  });

  it("role_insights with no arguments lists families and the unread count", async () => {
    const db = new FakeDb();
    const llm = new FakeLlm();
    llm.stubJdExtract(extract());
    const ctx = { ...ctxFor(db), llm };
    await call(ctx, "upsert_application", { externalRef: "a", company: "Acme", role: "FDE", jdRaw: JD });
    await call(ctx, "upsert_application", { externalRef: "b", company: "Beta", role: "FDE", jdRaw: JD });
    await call(ctxFor(db), "upsert_application", { externalRef: "c", company: "Gamma", role: "PM" });
    const out = await call(ctx, "role_insights");
    expect(out.data).toEqual({ families: [{ family: "forward-deployed-engineering", roles: 2 }], unread: 1 });
  });

  it("role_insights with a family returns requirements and never another user's roles", async () => {
    const db = new FakeDb();
    const llm = new FakeLlm();
    llm.stubJdExtract(extract());
    const mine = { ...ctxFor(db, "user-1"), llm };
    await call(mine, "upsert_application", { externalRef: "a", company: "Acme", role: "FDE", jdRaw: JD });
    llm.stubJdExtract(extract({ skills: ["rust"] }));
    await call({ ...ctxFor(db, "user-2"), llm }, "upsert_application", { externalRef: "z", company: "Other", role: "FDE", jdRaw: JD });

    const out = await call(mine, "role_insights", { family: "Forward Deployed Engineering" });
    expect(out.data.selection).toEqual({ family: "Forward Deployed Engineering" });
    expect(out.data.roles).toBe(1);
    expect(out.data.plan).toBeNull();
    const terms = out.data.requirements.map((r: { term: string }) => r.term);
    expect(terms).toContain("python");
    expect(terms).not.toContain("rust");
    expect(out.data.requirements[0]).toMatchObject({ askedBy: 1, share: 100, status: "gap" });
    expect(Array.isArray(out.data.requirements[0].phrases)).toBe(true);
  });

  it("lists role_insights among the tools", async () => {
    const res = await handleMessage(rpc("tools/list"), ctxFor(new FakeDb()));
    const names = (res!.result as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(names).toContain("role_insights");
  });
});

describe("MCP role interviews", () => {
  const questions = [
    { externalRef: "cog:background", competency: "Fit", text: "Walk me through your background.", lookFor: "Ends on why DE." },
    { externalRef: "cog:agents", competency: "Agent fluency", text: "Where do coding agents fail for you?", lookFor: "A real failure and how it was caught.", context: "Reported by candidates.", source: "Aced report" },
  ];

  it("prepares, lists and removes questions for an application", async () => {
    const ctx = ctxFor(new FakeDb());
    await call(ctx, "upsert_application", { externalRef: "cog-de", company: "Cognition", role: "Deployed Engineer" });
    const saved = await call(ctx, "upsert_interview_questions", { externalRef: "cog-de", round: "Technical", interviewer: "a Deployed Engineer", questions });
    expect(saved.isError).toBe(false);
    expect(saved.data).toMatchObject({ created: 2, updated: 0, application: { company: "Cognition" } });

    const listed = await call(ctx, "list_interview_questions", { externalRef: "cog-de" });
    expect(listed.data.questions.map((q: { externalRef: string }) => q.externalRef)).toEqual(["cog:background", "cog:agents"]);

    const removed = await call(ctx, "remove_interview_questions", { externalRefs: ["cog:agents"] });
    expect(removed.data).toEqual({ removed: 1 });
    expect((await call(ctx, "list_interview_questions")).data.questions).toHaveLength(1);
  });

  it("returns a tool error for an unknown application or a bad set", async () => {
    const ctx = ctxFor(new FakeDb());
    expect((await call(ctx, "upsert_interview_questions", { externalRef: "nope", questions })).isError).toBe(true);
    await call(ctx, "upsert_application", { externalRef: "cog-de", company: "Cognition", role: "DE" });
    expect((await call(ctx, "upsert_interview_questions", { externalRef: "cog-de", questions: [] })).isError).toBe(true);
  });

  it("is listed with the other tools", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["upsert_interview_questions", "list_interview_questions", "remove_interview_questions"]));
  });
});
