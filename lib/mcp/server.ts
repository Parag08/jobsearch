import { ZodError } from "zod";
import { TOOLS, type Tool, type ToolContext } from "./tools";

/**
 * A stateless MCP server over JSON-RPC 2.0 (the Streamable HTTP transport's plain-JSON
 * mode): one POST in, one JSON reply out, no session and no stream. That is all a
 * tools-only server needs, and it keeps the endpoint a pure function of (message, caller)
 * - so it is tested here without HTTP, and the route only authenticates and forwards.
 */

export const SERVER_INFO = { name: "jobsearch", version: "1.0.0" } as const;
/** Versions this server speaks; the newest is offered when the client asks for one we don't know. */
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const INSTRUCTIONS =
  "JobSearch is the user's record of their job search: applications by stage, and networking contacts. " +
  "Read with pipeline_summary and list_applications. Write with upsert_application and upsert_contact (idempotent on externalRef). " +
  "Status discipline: a prepared CV is not a submitted application and a drafted message is not a sent one - " +
  "call set_stage or log_interaction only for dated events the user has confirmed or that a receipt shows, and say which in the evidence.";

type Id = string | number | null;

interface RpcRequest {
  jsonrpc?: unknown;
  id?: Id;
  method?: unknown;
  params?: unknown;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: Id;
  result?: unknown;
  error?: { code: number; message: string };
}

const fail = (id: Id, code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });
const ok = (id: Id, result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });

function errorText(e: unknown): string {
  if (e instanceof ZodError) {
    return "Invalid arguments: " + e.issues.map((i) => `${i.path.join(".") || "(input)"}: ${i.message}`).join("; ");
  }
  return e instanceof Error ? e.message : String(e);
}

/** Handle one JSON-RPC message. Returns null for a notification (nothing is sent back). */
export async function handleMessage(
  message: unknown,
  ctx: ToolContext,
  tools: readonly Tool[] = TOOLS,
): Promise<RpcResponse | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) return fail(null, -32600, "Invalid Request");
  const req = message as RpcRequest;
  const isNotification = req.id === undefined;
  const id: Id = req.id ?? null;
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") return fail(id, -32600, "Invalid Request");
  if (isNotification) return null; // notifications/initialized, notifications/cancelled, ...

  const params = (req.params ?? {}) as Record<string, unknown>;
  switch (req.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : PROTOCOL_VERSIONS[0];
      return ok(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
    case "tools/call": {
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${String(params.name)}`);
      try {
        const result = await tool.run(ctx, params.arguments ?? {});
        return ok(id, { content: [{ type: "text", text: JSON.stringify(result) }], isError: false });
      } catch (e) {
        // A failed tool is a result the model can read and correct, not a protocol error.
        return ok(id, { content: [{ type: "text", text: errorText(e) }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${req.method}`);
  }
}

/** Handle a request body: a single message or a batch. Null means "no reply body" (202). */
export async function handleBody(
  body: unknown,
  ctx: ToolContext,
  tools: readonly Tool[] = TOOLS,
): Promise<RpcResponse | RpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (body.length === 0) return fail(null, -32600, "Invalid Request");
    const out: RpcResponse[] = [];
    for (const m of body) {
      const r = await handleMessage(m, ctx, tools);
      if (r) out.push(r);
    }
    return out.length ? out : null;
  }
  return handleMessage(body, ctx, tools);
}
