import { describe, it, expect } from "vitest";
import { streamGatewayText, parseSseChunk } from "./vercel-gateway-stream";
import { GATEWAY_URL } from "./vercel-gateway";
import { LlmHttpError } from "./llm-http";

/** Build a Response whose body streams the given string pieces. */
function sseResponse(pieces: string[], status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const p of pieces) controller.enqueue(enc.encode(p));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { "content-type": "text/event-stream" } });
}

const delta = (s: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: s } }] })}\n\n`;

function stubFetch(res: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return res;
  }) as typeof fetch;
  return { fetch: f, calls };
}

async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of it) out.push(chunk);
  return out;
}

describe("parseSseChunk", () => {
  it("pulls the content delta out of a data line", () => {
    const { deltas, rest } = parseSseChunk(delta("Hello"), "");
    expect(deltas).toEqual(["Hello"]);
    expect(rest).toBe("");
  });

  it("holds back a partial line so a split JSON payload is never parsed twice", () => {
    const whole = delta("Hello");
    const cut = Math.floor(whole.length / 2);
    const first = parseSseChunk(whole.slice(0, cut), "");
    expect(first.deltas).toEqual([]);
    const second = parseSseChunk(whole.slice(cut), first.rest);
    expect(second.deltas).toEqual(["Hello"]);
  });

  it("ignores the [DONE] sentinel rather than trying to parse it", () => {
    expect(parseSseChunk("data: [DONE]\n\n", "").deltas).toEqual([]);
  });

  it("skips comment and keep-alive lines", () => {
    expect(parseSseChunk(": ping\n\n", "").deltas).toEqual([]);
  });

  it("survives a malformed data line instead of throwing mid-stream", () => {
    expect(parseSseChunk("data: {not json}\n\n", "").deltas).toEqual([]);
  });
});

describe("streamGatewayText", () => {
  it("POSTs to the gateway with stream:true and a Bearer key", async () => {
    const { fetch, calls } = stubFetch(sseResponse([delta("hi"), "data: [DONE]\n\n"]));
    await collect(streamGatewayText({ apiKey: "vck_test", model: "openai/gpt-6-astra", prompt: "go", fetch }));

    expect(calls[0].url).toBe(GATEWAY_URL);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ model: "openai/gpt-6-astra", stream: true });
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer vck_test");
    expect(calls[0].url).not.toContain("vck_test");
  });

  it("yields each delta as it arrives, in order", async () => {
    const { fetch } = stubFetch(sseResponse([delta("Hel"), delta("lo "), delta("world"), "data: [DONE]\n\n"]));
    const out = await collect(streamGatewayText({ apiKey: "k", model: "openai/gpt-6-astra", prompt: "go", fetch }));
    expect(out).toEqual(["Hel", "lo ", "world"]);
    expect(out.join("")).toBe("Hello world");
  });

  it("reassembles deltas split across transport chunk boundaries", async () => {
    const whole = `${delta("streamed")}data: [DONE]\n\n`;
    const pieces = [whole.slice(0, 10), whole.slice(10, 25), whole.slice(25)];
    const { fetch } = stubFetch(sseResponse(pieces));
    const out = await collect(streamGatewayText({ apiKey: "k", model: "openai/gpt-6-astra", prompt: "go", fetch }));
    expect(out.join("")).toBe("streamed");
  });

  it("throws LlmHttpError on a non-OK status, so a spent credit is legible", async () => {
    const { fetch } = stubFetch(new Response('{"error":{"message":"insufficient credits"}}', { status: 402 }));
    const it = streamGatewayText({ apiKey: "k", model: "openai/gpt-6-astra", prompt: "go", fetch });
    await expect(collect(it)).rejects.toBeInstanceOf(LlmHttpError);
  });

  it("refuses to run without a key rather than sending an unauthenticated request", async () => {
    const { fetch, calls } = stubFetch(sseResponse([]));
    const it = streamGatewayText({ apiKey: "", model: "openai/gpt-6-astra", prompt: "go", fetch });
    await expect(collect(it)).rejects.toThrow(/AI_GATEWAY_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  it("refuses a model id with no provider prefix - the gateway routes on provider/model", async () => {
    const { fetch } = stubFetch(sseResponse([]));
    const it = streamGatewayText({ apiKey: "k", model: "gpt-6-astra", prompt: "go", fetch });
    await expect(collect(it)).rejects.toThrow(/provider\/model/);
  });

  it("ends cleanly when the stream closes without a [DONE]", async () => {
    const { fetch } = stubFetch(sseResponse([delta("partial")]));
    const out = await collect(streamGatewayText({ apiKey: "k", model: "openai/gpt-6-astra", prompt: "go", fetch }));
    expect(out).toEqual(["partial"]);
  });
});

describe("streamGatewayText JSON mode", () => {
  it("asks for a JSON object when json is set, which structured scoring needs", async () => {
    const { fetch, calls } = stubFetch(sseResponse([delta("{}"), "data: [DONE]\n\n"]));
    await collect(streamGatewayText({ apiKey: "k", model: "google/gemini-2.5-flash-lite", prompt: "json please", json: true, fetch }));
    expect(JSON.parse(String(calls[0].init.body)).response_format).toEqual({ type: "json_object" });
  });

  it("does not ask for JSON by default - prose stays prose", async () => {
    const { fetch, calls } = stubFetch(sseResponse([delta("hi"), "data: [DONE]\n\n"]));
    await collect(streamGatewayText({ apiKey: "k", model: "google/gemini-2.5-flash-lite", prompt: "hi", fetch }));
    expect(JSON.parse(String(calls[0].init.body)).response_format).toBeUndefined();
  });
});
