import { GATEWAY_URL } from "./vercel-gateway";
import { LlmHttpError } from "./llm-http";

/**
 * Streaming text generation through the Vercel AI Gateway.
 *
 * Uses the gateway's OpenAI-compatible Chat Completions endpoint with `stream: true`,
 * which returns Server-Sent Events. This reuses the project's existing AI client - plain
 * `fetch`, the same shape as lib/adapters/vercel-gateway.ts - rather than adding the `ai`
 * SDK, so the dependency count does not move.
 *
 * Auth is AI_GATEWAY_API_KEY (the skill's rule for local scripts and CI); the key is never
 * logged and never placed in a URL.
 */

export interface StreamOptions {
  apiKey: string;
  /** A `provider/model` id returned by https://ai-gateway.vercel.sh/v1/models. */
  model: string;
  prompt: string;
  /** Injected so tests never hit the network. */
  fetch?: typeof fetch;
  /** Override for tests/proxies. */
  url?: string;
  maxOutputTokens?: number;
}

export interface SseParseResult {
  /** Content deltas found in this chunk, in order. */
  deltas: string[];
  /** Trailing partial line to prepend to the next chunk. */
  rest: string;
}

/**
 * Parse one transport chunk of an SSE body.
 *
 * A chunk boundary can fall anywhere - including the middle of a JSON payload - so the
 * final, unterminated line is handed back as `rest` rather than parsed. Malformed or
 * non-data lines are skipped: one bad frame must not kill a stream that is still flowing.
 */
export function parseSseChunk(chunk: string, carry: string): SseParseResult {
  const buffer = carry + chunk;
  const lines = buffer.split("\n");
  // The last element is whatever followed the final newline: possibly a partial line.
  const rest = lines.pop() ?? "";
  const deltas: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(":")) continue; // blank or comment/keep-alive
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload) as { choices?: { delta?: { content?: string | null } }[] };
      const content = json.choices?.[0]?.delta?.content;
      if (typeof content === "string" && content.length > 0) deltas.push(content);
    } catch {
      /* a malformed frame is skipped, never thrown mid-stream */
    }
  }
  return { deltas, rest };
}

/**
 * Stream generated text as an async iterable of deltas. Yields each piece as it arrives
 * rather than buffering the whole completion, which is the point of streaming.
 */
export async function* streamGatewayText(opts: StreamOptions): AsyncGenerator<string, void, unknown> {
  if (!opts.apiKey) {
    throw new Error("streamGatewayText: missing API key (AI_GATEWAY_API_KEY)");
  }
  // The gateway routes on the provider prefix; a bare model name 404s at the edge.
  if (!opts.model.includes("/")) {
    throw new Error(`streamGatewayText: model "${opts.model}" needs a provider/model id (see /v1/models)`);
  }

  const doFetch = opts.fetch ?? fetch;
  const res = await doFetch(opts.url ?? GATEWAY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
      accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: "user", content: opts.prompt }],
      stream: true,
      max_tokens: opts.maxOutputTokens,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new LlmHttpError("vercel-gateway", res.status, detail.slice(0, 300));
  }
  if (!res.body) throw new Error("streamGatewayText: response had no body to stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const { deltas, rest } = parseSseChunk(decoder.decode(value, { stream: true }), carry);
      carry = rest;
      for (const d of deltas) yield d;
    }
    // Flush anything the stream ended on without a trailing newline.
    const tail = parseSseChunk("\n", carry);
    for (const d of tail.deltas) yield d;
  } finally {
    reader.releaseLock();
  }
}
