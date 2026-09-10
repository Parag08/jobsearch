import { describe, it, expect } from "vitest";
import {
  VercelGatewayLlm,
  GATEWAY_URL,
  GATEWAY_SMALL_MODEL,
  GATEWAY_PREMIUM_MODEL,
} from "./vercel-gateway";
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

function body(content: string, promptTokens = 900, completionTokens = 140) {
  return {
    id: "chatcmpl-1",
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
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

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

describe("VercelGatewayLlm", () => {
  it("POSTs to the gateway's OpenAI-compatible URL with a Bearer key", async () => {
    const { fetch, calls } = stubFetch(json(body(JSON.stringify(jd))));
    await new VercelGatewayLlm({ apiKey: "vck_test", fetch }).extractJd("raw jd");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(GATEWAY_URL);
    expect(GATEWAY_URL).toBe("https://ai-gateway.vercel.sh/v1/chat/completions");
    expect(calls[0].init.method).toBe("POST");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("authorization")).toBe("Bearer vck_test");
    expect(headers.get("content-type")).toBe("application/json");
    expect(calls[0].url).not.toContain("vck_test"); // key never in the URL
  });

  it("defaults to the small-tier model and honours an override", async () => {
    const a = stubFetch(json(body(JSON.stringify(jd))));
    await new VercelGatewayLlm({ apiKey: "k", fetch: a.fetch }).extractJd("raw");
    expect(JSON.parse(String(a.calls[0].init.body)).model).toBe(GATEWAY_SMALL_MODEL);

    const b2 = stubFetch(json(body(JSON.stringify(jd))));
    await new VercelGatewayLlm({ apiKey: "k", model: GATEWAY_PREMIUM_MODEL, fetch: b2.fetch }).extractJd("raw");
    expect(JSON.parse(String(b2.calls[0].init.body)).model).toBe(GATEWAY_PREMIUM_MODEL);
  });

  it("addresses models as provider/model, which is what the gateway routes on", () => {
    expect(GATEWAY_SMALL_MODEL).toMatch(/^[a-z0-9-]+\/[a-z0-9.\-]+$/);
    expect(GATEWAY_PREMIUM_MODEL).toMatch(/^[a-z0-9-]+\/[a-z0-9.\-]+$/);
  });

  it("asks for JSON mode when the task needs structure", async () => {
    const { fetch, calls } = stubFetch(json(body(JSON.stringify(jd))));
    await new VercelGatewayLlm({ apiKey: "k", fetch }).extractJd("raw");
    expect(JSON.parse(String(calls[0].init.body)).response_format).toEqual({ type: "json_object" });
  });

  it("reports usage from the response so the ledger records real numbers", async () => {
    const { fetch } = stubFetch(json(body(JSON.stringify(jd), 1234, 321)));
    const llm = new VercelGatewayLlm({ apiKey: "k", fetch });
    const r = await llm.extractJdMeasured("raw");

    expect(r.value.company).toBe("Grab");
    expect(r.usage).toEqual({ tokensIn: 1234, tokensOut: 321, model: GATEWAY_SMALL_MODEL });
    expect(llm.lastUsage?.tokensIn).toBe(1234);
  });

  it("summarizes without JSON mode", async () => {
    const { fetch, calls } = stubFetch(json(body("A compact sector summary.")));
    const out = await new VercelGatewayLlm({ apiKey: "k", fetch }).summarizeNode('{"path":["IT"]}');

    expect(out).toBe("A compact sector summary.");
    expect(JSON.parse(String(calls[0].init.body)).response_format).toBeUndefined();
  });

  it("throws LlmHttpError on a gateway error, so a spent-credit 402 is legible", async () => {
    const { fetch } = stubFetch(json({ error: { message: "insufficient credits" } }, 402));
    await expect(new VercelGatewayLlm({ apiKey: "k", fetch }).extractJd("raw")).rejects.toBeInstanceOf(
      LlmHttpError,
    );
  });

  it("refuses to construct without a key", () => {
    expect(() => new VercelGatewayLlm({ apiKey: "" })).toThrow(/AI_GATEWAY_API_KEY/);
  });
});
