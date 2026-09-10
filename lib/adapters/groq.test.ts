import { describe, it, expect } from "vitest";
import { GroqLlm } from "./groq";
import { LlmHttpError } from "./llm-http";

const jd = {
  company: "Grab",
  role: "Senior PM, AI",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["roadmap"],
  keywords: ["genai"],
  seniority: "senior",
  visaNote: null,
  location: "Singapore",
};

function groqBody(content: string, promptTokens = 800, completionTokens = 120) {
  return {
    id: "chatcmpl-1",
    object: "chat.completion",
    model: "llama-3.3-70b-versatile",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
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

describe("GroqLlm.extractJd", () => {
  it("POSTs to the OpenAI-compatible chat completions URL with a Bearer key", async () => {
    const { fetch, calls } = stubFetch(json(groqBody(JSON.stringify(jd))));
    const llm = new GroqLlm({ apiKey: "gsk_test", fetch });
    await llm.extractJd("raw jd");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(calls[0].init.method).toBe("POST");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("authorization")).toBe("Bearer gsk_test");
    expect(headers.get("content-type")).toBe("application/json");
    expect(calls[0].url).not.toContain("gsk_test"); // key never in the URL
  });

  it("uses the default model and honours a configured one", async () => {
    const a = stubFetch(json(groqBody(JSON.stringify(jd))));
    await new GroqLlm({ apiKey: "k", fetch: a.fetch }).extractJd("raw");
    expect(JSON.parse(String(a.calls[0].init.body)).model).toBe("llama-3.3-70b-versatile");

    const b = stubFetch(json(groqBody(JSON.stringify(jd))));
    const llm = new GroqLlm({ apiKey: "k", model: "llama-3.1-8b-instant", fetch: b.fetch });
    await llm.extractJd("raw");
    expect(JSON.parse(String(b.calls[0].init.body)).model).toBe("llama-3.1-8b-instant");
    expect(llm.model).toBe("llama-3.1-8b-instant");
  });

  it("sends a single user message with the JD prompt and requests json_object output", async () => {
    const { fetch, calls } = stubFetch(json(groqBody(JSON.stringify(jd))));
    await new GroqLlm({ apiKey: "k", fetch }).extractJd("We are hiring a PM at Grab.");

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toContain("We are hiring a PM at Grab.");
    expect(body.messages[0].content).toMatch(/JSON/); // Groq requires the word in the prompt for json_object
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.temperature).toBe(0);
    expect(typeof body.max_tokens).toBe("number");
    expect(body.stream).toBeFalsy();
  });

  it("parses choices[0].message.content into a valid JdExtract", async () => {
    const { fetch } = stubFetch(json(groqBody(JSON.stringify(jd))));
    await expect(new GroqLlm({ apiKey: "k", fetch }).extractJd("raw")).resolves.toEqual(jd);
  });

  it("captures usage.prompt_tokens / completion_tokens and notifies onUsage", async () => {
    const { fetch } = stubFetch(json(groqBody(JSON.stringify(jd), 777, 99)));
    const llm = new GroqLlm({ apiKey: "k", fetch });
    const seen: unknown[] = [];
    llm.onUsage((u) => seen.push(u));
    const { usage } = await llm.extractJdMeasured("raw");
    expect(usage).toEqual({ tokensIn: 777, tokensOut: 99, model: "llama-3.3-70b-versatile" });
    expect(llm.lastUsage).toEqual(usage);
    expect(seen).toEqual([usage]);
  });

  it("throws an LlmHttpError carrying the status on non-2xx", async () => {
    const { fetch } = stubFetch(json({ error: { message: "Rate limit reached", type: "tokens" } }, 429));
    const err = await new GroqLlm({ apiKey: "k", fetch }).extractJd("raw").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmHttpError);
    expect((err as LlmHttpError).status).toBe(429);
    expect((err as LlmHttpError).provider).toBe("groq");
    expect((err as Error).message).toMatch(/Rate limit/);
  });

  it("throws a clear error on malformed JSON content", async () => {
    const { fetch } = stubFetch(json(groqBody("{not json")));
    await expect(new GroqLlm({ apiKey: "k", fetch }).extractJd("raw")).rejects.toThrow(/invalid JSON/i);
  });

  it("throws a clear error when the JSON does not match JdExtractSchema", async () => {
    const { fetch } = stubFetch(json(groqBody(JSON.stringify({ ...jd, company: null }))));
    await expect(new GroqLlm({ apiKey: "k", fetch }).extractJd("raw")).rejects.toThrow(/JdExtract.*company/);
  });

  it("throws a clear error when choices are missing", async () => {
    const { fetch } = stubFetch(json({ choices: [] }));
    await expect(new GroqLlm({ apiKey: "k", fetch }).extractJd("raw")).rejects.toThrow(/groq.*no text/i);
  });

  it("refuses to construct without an API key", () => {
    expect(() => new GroqLlm({ apiKey: "", fetch: stubFetch().fetch })).toThrow(/GROQ_API_KEY/);
  });
});

describe("GroqLlm.summarizeNode", () => {
  it("omits response_format for plain text, trims the reply and records usage", async () => {
    const { fetch, calls } = stubFetch(json(groqBody("\nAI PM roles cluster in Singapore.\n", 200, 30)));
    const llm = new GroqLlm({ apiKey: "k", fetch });
    const out = await llm.summarizeNode('{"id":"it-ai-singapore"}');

    expect(out).toBe("AI PM roles cluster in Singapore.");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.response_format).toBeUndefined();
    expect(body.messages[0].content).toContain('{"id":"it-ai-singapore"}');
    expect(body.max_tokens).toBeLessThanOrEqual(250);
    expect(llm.lastUsage).toEqual({ tokensIn: 200, tokensOut: 30, model: "llama-3.3-70b-versatile" });
  });
});
