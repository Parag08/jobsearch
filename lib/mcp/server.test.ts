import { describe, it, expect } from "vitest";
import { FakeDb } from "../repos/fake-db";
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
