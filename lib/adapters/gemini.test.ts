import { describe, it, expect } from "vitest";
import { GeminiLlm } from "./gemini";
import { LlmHttpError } from "./llm-http";

const jd = {
  company: "Grab",
  role: "Senior PM, AI",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["roadmap", "llm evals"],
  keywords: ["genai"],
  seniority: "senior",
  visaNote: "EP sponsorship stated",
  location: "Singapore",
};

function geminiBody(text: string, promptTokens = 900, candidatesTokens = 150) {
  return {
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: promptTokens, candidatesTokenCount: candidatesTokens, totalTokenCount: promptTokens + candidatesTokens },
  };
}

/** Records every call and replies with the canned Response(s) in order. */
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

describe("GeminiLlm.extractJd", () => {
  it("POSTs to the v1beta generateContent URL for the model with the key in the query string", async () => {
    const { fetch, calls } = stubFetch(json(geminiBody(JSON.stringify(jd))));
    const llm = new GeminiLlm({ apiKey: "KEY123", fetch });
    await llm.extractJd("raw jd");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=KEY123",
    );
    expect(calls[0].init.method).toBe("POST");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    // Key travels in the URL only, never as a header.
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-goog-api-key")).toBeNull();
  });

  it("honours a configured model name", async () => {
    const { fetch, calls } = stubFetch(json(geminiBody(JSON.stringify(jd))));
    const llm = new GeminiLlm({ apiKey: "k", model: "gemini-2.5-flash-lite", fetch });
    await llm.extractJd("raw jd");
    expect(calls[0].url).toContain("/models/gemini-2.5-flash-lite:generateContent");
    expect(llm.model).toBe("gemini-2.5-flash-lite");
  });

  it("sends the JD prompt as a user turn and asks for application/json output", async () => {
    const { fetch, calls } = stubFetch(json(geminiBody(JSON.stringify(jd))));
    const llm = new GeminiLlm({ apiKey: "k", fetch });
    await llm.extractJd("We are hiring a PM at Grab.");

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].role).toBe("user");
    expect(body.contents[0].parts[0].text).toContain("We are hiring a PM at Grab.");
    expect(body.contents[0].parts[0].text).toContain('"sectorPath"');
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.temperature).toBe(0);
    expect(typeof body.generationConfig.maxOutputTokens).toBe("number");
  });

  it("parses candidates[0].content.parts[0].text into a valid JdExtract", async () => {
    const { fetch } = stubFetch(json(geminiBody(JSON.stringify(jd))));
    const llm = new GeminiLlm({ apiKey: "k", fetch });
    await expect(llm.extractJd("raw")).resolves.toEqual(jd);
  });

  it("tolerates fenced JSON in the reply", async () => {
    const { fetch } = stubFetch(json(geminiBody("```json\n" + JSON.stringify(jd) + "\n```")));
    const llm = new GeminiLlm({ apiKey: "k", fetch });
    await expect(llm.extractJd("raw")).resolves.toEqual(jd);
  });

  it("captures usage from usageMetadata and notifies onUsage listeners", async () => {
    const { fetch } = stubFetch(json(geminiBody(JSON.stringify(jd), 901, 151)));
    const llm = new GeminiLlm({ apiKey: "k", fetch });
    const seen: unknown[] = [];
    llm.onUsage((u) => seen.push(u));
    expect(llm.lastUsage).toBeNull();

    const { value, usage } = await llm.extractJdMeasured("raw");
    expect(value).toEqual(jd);
    expect(usage).toEqual({ tokensIn: 901, tokensOut: 151, model: "gemini-2.0-flash" });
    expect(llm.lastUsage).toEqual(usage);
    expect(seen).toEqual([usage]);
  });

  it("onUsage returns an unsubscribe function", async () => {
    const { fetch } = stubFetch(json(geminiBody(JSON.stringify(jd))), json(geminiBody(JSON.stringify(jd))));
    const llm = new GeminiLlm({ apiKey: "k", fetch });
    const seen: unknown[] = [];
    const off = llm.onUsage((u) => seen.push(u));
    await llm.extractJd("raw");
    off();
    await llm.extractJd("raw");
    expect(seen).toHaveLength(1);
  });

  it("throws an LlmHttpError carrying the status on non-2xx", async () => {
    const { fetch } = stubFetch(json({ error: { code: 429, message: "Resource has been exhausted" } }, 429));
    const llm = new GeminiLlm({ apiKey: "k", fetch });
    const err = await llm.extractJd("raw").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmHttpError);
    expect((err as LlmHttpError).status).toBe(429);
    expect((err as LlmHttpError).provider).toBe("gemini");
    expect((err as Error).message).toMatch(/exhausted/);
  });

  it("throws a clear error when the model returns malformed JSON", async () => {
    const { fetch } = stubFetch(json(geminiBody('{"company": "Grab", "role":')));
    const llm = new GeminiLlm({ apiKey: "k", fetch });
    await expect(llm.extractJd("raw")).rejects.toThrow(/invalid JSON/i);
  });

  it("throws a clear error when the JSON does not match JdExtractSchema", async () => {
    const { fetch } = stubFetch(json(geminiBody(JSON.stringify({ ...jd, sectorPath: [] }))));
    const llm = new GeminiLlm({ apiKey: "k", fetch });
    await expect(llm.extractJd("raw")).rejects.toThrow(/JdExtract.*sectorPath/);
  });

  it("throws a clear error when the response has no candidates (e.g. safety block)", async () => {
    const { fetch } = stubFetch(json({ promptFeedback: { blockReason: "SAFETY" } }));
    const llm = new GeminiLlm({ apiKey: "k", fetch });
    await expect(llm.extractJd("raw")).rejects.toThrow(/gemini.*no text/i);
  });

  it("refuses to construct without an API key", () => {
    expect(() => new GeminiLlm({ apiKey: "", fetch: stubFetch().fetch })).toThrow(/GEMINI_API_KEY/);
  });
});

describe("GeminiLlm.summarizeNode", () => {
  it("asks for plain text (no JSON mime type), trims the reply and records usage", async () => {
    const { fetch, calls } = stubFetch(json(geminiBody("  AI product roles in Singapore.  \n", 300, 40)));
    const llm = new GeminiLlm({ apiKey: "k", fetch });
    const out = await llm.summarizeNode('{"id":"it-ai-singapore"}');

    expect(out).toBe("AI product roles in Singapore.");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.generationConfig.responseMimeType).toBeUndefined();
    expect(body.contents[0].parts[0].text).toContain('{"id":"it-ai-singapore"}');
    expect(body.generationConfig.maxOutputTokens).toBeLessThanOrEqual(250);
    expect(llm.lastUsage).toEqual({ tokensIn: 300, tokensOut: 40, model: "gemini-2.0-flash" });
  });
});
