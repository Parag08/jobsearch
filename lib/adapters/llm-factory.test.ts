import { describe, it, expect } from "vitest";
import { createLlm, RoutedLlm, withLedger, LEDGER_MODULES, type LedgerLogFn } from "./llm-factory";
import { GeminiLlm } from "./gemini";
import { GroqLlm } from "./groq";
import { AnthropicLlm } from "./anthropic";
import type { LlmUsage, UsageReportingLlm } from "./llm-http";
import type { JdExtract } from "../types";

const jd: JdExtract = {
  company: "Grab",
  role: "PM",
  roleFamily: "product-management",
  sectorPath: ["IT", "AI", "Singapore"],
  skills: ["sql"],
  keywords: [],
  seniority: null,
  visaNote: null,
  location: "Singapore",
};

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
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const geminiBody = (text: string) => ({
  candidates: [{ content: { parts: [{ text }] } }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
});

const noFetch = (async () => {
  throw new Error("network must not be touched");
}) as unknown as typeof fetch;

describe("createLlm", () => {
  it("returns null when no provider key is configured", () => {
    expect(createLlm({}, noFetch)).toBeNull();
    expect(createLlm({ GEMINI_API_KEY: "", GROQ_API_KEY: undefined, ANTHROPIC_API_KEY: "" }, noFetch)).toBeNull();
  });

  it("small tier -> Gemini when GEMINI_API_KEY is set; premium falls back to it (free-first)", () => {
    const llm = createLlm({ GEMINI_API_KEY: "g" }, noFetch);
    expect(llm).toBeInstanceOf(RoutedLlm);
    expect(llm!.small).toBeInstanceOf(GeminiLlm);
    expect(llm!.premium).toBe(llm!.small);
  });

  it("small tier -> Groq when only GROQ_API_KEY is set; premium falls back to it", () => {
    const llm = createLlm({ GROQ_API_KEY: "q" }, noFetch)!;
    expect(llm.small).toBeInstanceOf(GroqLlm);
    expect(llm.premium).toBe(llm.small);
  });

  it("prefers Gemini over Groq for the small tier when both keys are set", () => {
    const llm = createLlm({ GEMINI_API_KEY: "g", GROQ_API_KEY: "q" }, noFetch)!;
    expect(llm.small).toBeInstanceOf(GeminiLlm);
  });

  it("premium tier -> Anthropic when ANTHROPIC_API_KEY is set alongside a free provider", () => {
    const llm = createLlm({ GROQ_API_KEY: "q", ANTHROPIC_API_KEY: "a" }, noFetch)!;
    expect(llm.small).toBeInstanceOf(GroqLlm);
    expect(llm.premium).toBeInstanceOf(AnthropicLlm);
  });

  it("with only ANTHROPIC_API_KEY, both tiers use Anthropic (the only option; not free)", () => {
    const llm = createLlm({ ANTHROPIC_API_KEY: "a" }, noFetch)!;
    expect(llm.small).toBeInstanceOf(AnthropicLlm);
    expect(llm.premium).toBe(llm.small);
  });

  it("honours *_MODEL overrides and falls back to each provider's default", () => {
    const llm = createLlm(
      { GEMINI_API_KEY: "g", GROQ_API_KEY: "q", ANTHROPIC_API_KEY: "a", GEMINI_MODEL: "gemini-2.5-flash", ANTHROPIC_MODEL: "claude-haiku-4-5" },
      noFetch,
    )!;
    expect((llm.small as GeminiLlm).model).toBe("gemini-2.5-flash");
    expect((llm.premium as AnthropicLlm).model).toBe("claude-haiku-4-5");
    const groqOnly = createLlm({ GROQ_API_KEY: "q", GROQ_MODEL: "llama-3.1-8b-instant" }, noFetch)!;
    expect((groqOnly.small as GroqLlm).model).toBe("llama-3.1-8b-instant");
    expect((createLlm({ GROQ_API_KEY: "q" }, noFetch)!.small as GroqLlm).model).toBe("llama-3.3-70b-versatile");
  });

  it("threads the injected fetch into the providers (no ambient network)", async () => {
    const { fetch, calls } = stubFetch(json(geminiBody(JSON.stringify(jd))));
    const llm = createLlm({ GEMINI_API_KEY: "g" }, fetch)!;
    await expect(llm.extractJd("raw")).resolves.toEqual(jd);
    expect(calls[0].url).toContain("generativelanguage.googleapis.com");
  });
});

describe("RoutedLlm", () => {
  function fakeReporting(model: string, tokensIn = 1, tokensOut = 1): UsageReportingLlm & { calls: string[] } {
    const listeners: ((u: LlmUsage) => void)[] = [];
    const self = {
      calls: [] as string[],
      lastUsage: null as LlmUsage | null,
      onUsage(cb: (u: LlmUsage) => void) {
        listeners.push(cb);
        return () => void listeners.splice(listeners.indexOf(cb), 1);
      },
      async extractJdMeasured(raw: string) {
        self.calls.push(`extract:${raw}`);
        const usage = { tokensIn, tokensOut, model };
        self.lastUsage = usage;
        listeners.forEach((l) => l(usage));
        return { value: jd, usage };
      },
      async summarizeNodeMeasured(n: string) {
        self.calls.push(`summarize:${n}`);
        const usage = { tokensIn, tokensOut, model };
        self.lastUsage = usage;
        listeners.forEach((l) => l(usage));
        return { value: `summary of ${n}`, usage };
      },
      async extractJd(raw: string) {
        return (await self.extractJdMeasured(raw)).value;
      },
      async summarizeNode(n: string) {
        return (await self.summarizeNodeMeasured(n)).value;
      },
    };
    return self;
  }

  it("routes each task through routeModel: small for extraction/summaries, premium for polish/outreach", async () => {
    const small = fakeReporting("small-model");
    const premium = fakeReporting("premium-model");
    const routed = new RoutedLlm({ small, premium });

    expect(routed.providerFor("extract-jd")).toBe(small);
    expect(routed.providerFor("classify-sector")).toBe(small);
    expect(routed.providerFor("summarize-node")).toBe(small);
    expect(routed.providerFor("polish-cv")).toBe(premium);
    expect(routed.providerFor("draft-outreach")).toBe(premium);

    await routed.extractJd("raw");
    await routed.summarizeNode("{}");
    expect(small.calls).toEqual(["extract:raw", "summarize:{}"]);
    expect(premium.calls).toEqual([]);
  });

  it("forwards usage from whichever provider ran (lastUsage + onUsage), without double-counting a shared provider", async () => {
    const small = fakeReporting("small-model", 7, 3);
    const premium = fakeReporting("premium-model", 70, 30);
    const routed = new RoutedLlm({ small, premium });
    const seen: LlmUsage[] = [];
    routed.onUsage((u) => seen.push(u));

    await routed.extractJd("raw");
    expect(routed.lastUsage).toEqual({ tokensIn: 7, tokensOut: 3, model: "small-model" });
    await routed.providerFor("polish-cv").summarizeNode("{}");
    expect(routed.lastUsage).toEqual({ tokensIn: 70, tokensOut: 30, model: "premium-model" });
    expect(seen).toHaveLength(2);

    const shared = fakeReporting("one", 1, 1);
    const single = new RoutedLlm({ small: shared, premium: shared });
    const seen2: LlmUsage[] = [];
    single.onUsage((u) => seen2.push(u));
    await single.extractJd("raw");
    expect(seen2).toHaveLength(1);
  });
});

describe("withLedger", () => {
  it("extractJd logs module 'process-jd' with the provider's model and token counts", async () => {
    const { fetch } = stubFetch(json(geminiBody(JSON.stringify(jd))));
    const inner = new GeminiLlm({ apiKey: "g", model: "gemini-2.0-flash", fetch });
    const logged: Parameters<LedgerLogFn>[0][] = [];
    const llm = withLedger(inner, (e) => {
      logged.push(e);
    });

    await expect(llm.extractJd("raw")).resolves.toEqual(jd);
    expect(logged).toEqual([{ module: "process-jd", model: "gemini-2.0-flash", tokensIn: 10, tokensOut: 5 }]);
    expect(LEDGER_MODULES.extractJd).toBe("process-jd");
  });

  it("summarizeNode logs module 'sector-graph' and awaits an async logFn", async () => {
    const { fetch } = stubFetch(json(geminiBody("A summary.")));
    const inner = new GeminiLlm({ apiKey: "g", fetch });
    const logged: string[] = [];
    const llm = withLedger(inner, async (e) => {
      await Promise.resolve();
      logged.push(e.module);
    });
    await expect(llm.summarizeNode("{}")).resolves.toBe("A summary.");
    expect(logged).toEqual([LEDGER_MODULES.summarizeNode]);
    expect(LEDGER_MODULES.summarizeNode).toBe("sector-graph");
  });

  it("logs nothing when the call fails (no usage to account for) and rethrows", async () => {
    const { fetch } = stubFetch(json({ error: "boom" }, 500));
    const inner = new GeminiLlm({ apiKey: "g", fetch });
    const logged: unknown[] = [];
    const llm = withLedger(inner, (e) => {
      logged.push(e);
    });
    await expect(llm.extractJd("raw")).rejects.toThrow(/500/);
    expect(logged).toEqual([]);
  });

  it("still exposes lastUsage / onUsage from the wrapped provider", async () => {
    const { fetch } = stubFetch(json(geminiBody(JSON.stringify(jd))));
    const inner = new GeminiLlm({ apiKey: "g", fetch });
    const llm = withLedger(inner, () => {});
    const seen: LlmUsage[] = [];
    llm.onUsage((u) => seen.push(u));
    await llm.extractJd("raw");
    expect(llm.lastUsage).toEqual({ tokensIn: 10, tokensOut: 5, model: "gemini-2.0-flash" });
    expect(seen).toHaveLength(1);
  });

  it("composes with createLlm (the production wiring)", async () => {
    const { fetch } = stubFetch(json(geminiBody(JSON.stringify(jd))));
    const logged: string[] = [];
    const llm = withLedger(createLlm({ GEMINI_API_KEY: "g" }, fetch)!, (e) => {
      logged.push(`${e.module}:${e.model}`);
    });
    await llm.extractJd("raw");
    expect(logged).toEqual(["process-jd:gemini-2.0-flash"]);
  });
});
