import { NextResponse } from "next/server";
import { getAgentWorkspace } from "@/lib/db/agent";
import { handleBody } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A posting plus its envelope fits well inside this; anything larger is not a tool call. */
const MAX_BODY_BYTES = 512 * 1024;

const rpcError = (status: number, code: number, message: string, headers?: HeadersInit) =>
  NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers });

/**
 * POST /api/mcp - the JobSearch MCP server (Streamable HTTP, stateless JSON replies).
 * Auth is a personal token made on /app/agent, sent as `Authorization: Bearer jsk_...`.
 * Everything else lives in lib/mcp (protocol + tools) and lib/services/agent-sync (rules).
 */
export async function POST(request: Request): Promise<Response> {
  const nowIso = new Date().toISOString();
  const auth = await getAgentWorkspace(request.headers.get("authorization"), nowIso);
  if (!auth.ok) {
    return auth.reason === "unconfigured"
      ? rpcError(503, -32000, "Agent access is not configured on this deployment.")
      : rpcError(401, -32001, "Missing or invalid token. Create one on /app/agent.", { "WWW-Authenticate": "Bearer" });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return rpcError(413, -32600, "Request too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return rpcError(400, -32700, "Parse error");
  }

  try {
    const reply = await handleBody(body, { ...auth.workspace, nowIso });
    return reply === null ? new Response(null, { status: 202 }) : NextResponse.json(reply);
  } catch {
    return rpcError(500, -32603, "Internal error");
  }
}

/** No server-initiated stream: the spec's answer for a server that offers none. */
export function GET(): Response {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
