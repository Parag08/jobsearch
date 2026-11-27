import { NextResponse } from "next/server";
import { envFor } from "@/lib/services/settings";
import { getAgentWorkspace } from "@/lib/db/agent";
import { capReads, handleBody, MAX_READS_PER_REQUEST } from "@/lib/mcp/server";
import { createLlm, withLedger } from "@/lib/adapters/llm-factory";
import { customQuestionMaxCharsFromEnv } from "@/lib/interview/custom-questions";
import { logTokens } from "@/lib/repos/token-ledger";
import { withAiCallLimit } from "@/lib/services/ai-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A posting plus its envelope fits well inside this; anything larger is not a tool call. */
const MAX_BODY_BYTES = 512 * 1024;

const rpcError = (status: number, code: number, message: string, headers?: HeadersInit) =>
  NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers });

/**
 * POST /api/mcp - the JobSearch MCP server (Streamable HTTP, stateless JSON replies).
 * Auth is a personal token made in Settings → Assistant, sent as `Authorization: Bearer jsk_...`.
 * Everything else lives in lib/mcp (protocol + tools) and lib/services/agent-sync (rules).
 */
export async function POST(request: Request): Promise<Response> {
  const nowIso = new Date().toISOString();
  const auth = await getAgentWorkspace(request.headers.get("authorization"), nowIso);
  if (!auth.ok) {
    switch (auth.reason) {
      case "unconfigured":
        return rpcError(503, -32000, "Agent access is not configured on this deployment.");
      case "rate_limited":
        return rpcError(429, -32002, `Too many requests for this token. Retry in ${auth.retryAfterSec}s.`, {
          "Retry-After": String(auth.retryAfterSec),
        });
      case "expired":
        return rpcError(401, -32001, "This token has expired. Create a new one in Settings → Assistant (/app/settings?section=assistant).", { "WWW-Authenticate": "Bearer" });
      default:
        return rpcError(401, -32001, "Missing or invalid token. Create one in Settings → Assistant (/app/settings?section=assistant).", { "WWW-Authenticate": "Bearer" });
    }
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return rpcError(413, -32600, "Request too large.");
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return rpcError(413, -32600, "Request too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return rpcError(400, -32700, "Parse error");
  }

  try {
    // The small-tier reader for postings; absent (undefined) when no provider is configured.
    const { db, userId } = auth.workspace;
    const env = await envFor(db, userId);
    const routed = createLlm(env);
    const base = routed ? withAiCallLimit(routed, { cannedAi: false, db, userId }) : null;
    const date = nowIso.slice(0, 10);
    const llm = base
      ? capReads(
          withLedger(base, async (e) => {
            await logTokens(db, userId, { date, module: e.module, model: e.model, tokensIn: e.tokensIn, tokensOut: e.tokensOut }).catch(
              () => undefined,
            );
          }),
          MAX_READS_PER_REQUEST,
        )
      : undefined;
    const reply = await handleBody(body, {
      ...auth.workspace,
      nowIso,
      llm,
      customQuestionMaxChars: customQuestionMaxCharsFromEnv(env),
    });
    return reply === null ? new Response(null, { status: 202 }) : NextResponse.json(reply);
  } catch {
    return rpcError(500, -32603, "Internal error");
  }
}

/** No server-initiated stream: the spec's answer for a server that offers none. */
export function GET(): Response {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
