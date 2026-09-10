import { describe, it, expect } from "vitest";
import { AnthropicLlm, ANTHROPIC_DEFAULT_MODEL } from "./anthropic";
import { LlmHttpError } from "./llm-http";

const jd = {
  company: "Grab",
  role: "Senior PM, AI",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["roadmap"],
  keywords: [],
  seniority: null,
  visaNote: null,
  location: "Singapore",
};

function anthropicBody(text: string, inputTokens = 1000, outputTokens = 200) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-x",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

function stubFetch(...responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const r = responses.shift();
    if (!r) throw new Error("stubFetch: no response left");
    return r;
  }) as typeof fetch;
  return { fetch: f, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("AnthropicLlm.extractJd", () => {
  it("POSTs to /v1/messages with x-api-key and anthropic-version headers", async () => {
    const { fetch, calls } = stubFetch(json(anthropicBody(JSON.stringify(jd))));
    const llm = new AnthropicLlm({ apiKey: "sk-ant-test", fetch });
    await llm.extractJd("raw jd");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0].init.method).toBe("POST");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-test");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("authorization")).toBeNull();
  });

  it("uses the default model and honours a configured one", async () => {
    const a = stubFetch(json(anthropicBody(JSON.stringify(jd))));
    const d = new AnthropicLlm({ apiKey: "k", fetch: a.fetch });
    await d.extractJd("raw");
    expect(JSON.parse(String(a.calls[0].init.body)).model).toBe(ANTHROPIC_DEFAULT_MODEL);
    expect(d.model).toBe(ANTHROPIC_DEFAULT_MODEL);

    const b = stubFetch(json(anthropicBody(JSON.stringify(jd))));
    const llm = new AnthropicLlm({ apiKey: "k", model: "claude-haiku-4-5", fetch: b.fetch });
    await llm.extractJd("raw");
    expect(JSON.parse(String(b.calls[0].init.body)).model).toBe("claude-haiku-4-5");
  });

  it("sends a single user message with the JD prompt and a max_tokens cap", async () => {
    const { fetch, calls } = stubFetch(json(anthropicBody(JSON.stringify(jd))));
    await new AnthropicLlm({ apiKey: "k", fetch }).extractJd("We are hiring a PM at Grab.");

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.messages).toEqual([{ role: "user", content: expect.stringContaining("We are hiring a PM at Grab.") }]);
    expect(typeof body.max_tokens).toBe("number"); // required by the Messages API
    expect(body.temperature).toBe(0);
    expect(body.stream).toBeFalsy();
  });

  it("parses content[0].text into a valid JdExtract (no JSON mode: prose/fences tolerated)", async () => {
    const { fetch } = stubFetch(json(anthropicBody("Here you go:\n```json\n" + JSON.stringify(jd) + "\n```")));
    await expect(new AnthropicLlm({ apiKey: "k", fetch }).extractJd("raw")).resolves.toEqual(jd);
  });

  it("captures usage.input_tokens / output_tokens and notifies onUsage", async () => {
    const { fetch } = stubFetch(json(anthropicBody(JSON.stringify(jd), 1234, 210)));
    const llm = new AnthropicLlm({ apiKey: "k", fetch });
    const seen: unknown[] = [];
    llm.onUsage((u) => seen.push(u));
    const { usage } = await llm.extractJdMeasured("raw");
    expect(usage).toEqual({ tokensIn: 1234, tokensOut: 210, model: ANTHROPIC_DEFAULT_MODEL });
    expect(llm.lastUsage).toEqual(usage);
    expect(seen).toEqual([usage]);
  });

  it("throws an LlmHttpError carrying the status on non-2xx", async () => {
    const { fetch } = stubFetch(json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401));
    const err = await new AnthropicLlm({ apiKey: "k", fetch }).extractJd("raw").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmHttpError);
    expect((err as LlmHttpError).status).toBe(401);
    expect((err as LlmHttpError).provider).toBe("anthropic");
    expect((err as Error).message).toMatch(/invalid x-api-key/);
  });

  it("throws a clear error on malformed JSON content", async () => {
    const { fetch } = stubFetch(json(anthropicBody('{"company": "Grab",')));
    await expect(new AnthropicLlm({ apiKey: "k", fetch }).extractJd("raw")).rejects.toThrow(/invalid JSON/i);
  });

  it("throws a clear error when the JSON does not match JdExtractSchema", async () => {
    const { fetch } = stubFetch(json(anthropicBody(JSON.stringify({ ...jd, skills: "sql" }))));
    await expect(new AnthropicLlm({ apiKey: "k", fetch }).extractJd("raw")).rejects.toThrow(/JdExtract.*skills/);
  });

  it("throws a clear error when there is no text block", async () => {
    const { fetch } = stubFetch(json({ content: [], usage: { input_tokens: 1, output_tokens: 0 } }));
    await expect(new AnthropicLlm({ apiKey: "k", fetch }).extractJd("raw")).rejects.toThrow(/anthropic.*no text/i);
  });

  it("refuses to construct without an API key", () => {
    expect(() => new AnthropicLlm({ apiKey: "", fetch: stubFetch().fetch })).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("AnthropicLlm.summarizeNode", () => {
  it("returns trimmed plain text and records usage", async () => {
    const { fetch, calls } = stubFetch(json(anthropicBody("  Fintech PM roles.  ", 400, 60)));
    const llm = new AnthropicLlm({ apiKey: "k", fetch });
    const out = await llm.summarizeNode('{"id":"fintech-sg"}');
    expect(out).toBe("Fintech PM roles.");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.messages[0].content).toContain('{"id":"fintech-sg"}');
    expect(body.max_tokens).toBeLessThanOrEqual(250);
    expect(llm.lastUsage).toEqual({ tokensIn: 400, tokensOut: 60, model: ANTHROPIC_DEFAULT_MODEL });
  });
});
