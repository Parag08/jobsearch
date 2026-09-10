import { HttpLlmBase, readBodyOrThrow, usageInt, type CompletionRequest, type LlmCallResult } from "./llm-http";

/** OpenAI-compatible chat completions endpoint. */
export const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

/**
 * Models are addressed as `provider/model`; the gateway does the routing, so one
 * key reaches every provider. Both defaults were checked against the live
 * catalogue (GET https://ai-gateway.vercel.sh/v1/models - no auth needed).
 *
 * Small tier is the cheapest capable JSON-mode model: extraction is high volume
 * and low judgement, so a JD extract costs a fraction of a cent (token rule #5).
 * Premium mirrors the direct-Anthropic default, for polish and outreach only.
 */
export const GATEWAY_SMALL_MODEL = "google/gemini-2.5-flash-lite";
export const GATEWAY_PREMIUM_MODEL = "anthropic/claude-sonnet-4.5";

export interface VercelGatewayOptions {
  apiKey: string;
  /** `provider/model`. Override via AI_GATEWAY_SMALL_MODEL / AI_GATEWAY_PREMIUM_MODEL. */
  model?: string;
  /** Injected so tests never hit the network. */
  fetch?: typeof fetch;
  /** Override for tests/proxies. */
  url?: string;
}

/** OpenAI-compatible chat completion response (only the parts we read). */
interface GatewayResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Vercel AI Gateway adapter. One key, every provider, billed against the credit
 * included with the Vercel plan - so the free-first rule (CLAUDE.md rule 5) holds
 * without managing a key per provider.
 *
 *   POST https://ai-gateway.vercel.sh/v1/chat/completions   Authorization: Bearer <key>
 *
 * A 402 from the gateway means the credit is spent; it surfaces as LlmHttpError
 * like any other failure, so callers degrade instead of crashing.
 */
export class VercelGatewayLlm extends HttpLlmBase {
  readonly model: string;
  private readonly apiKey: string;
  private readonly url: string;

  constructor(opts: VercelGatewayOptions) {
    super(opts.fetch ?? fetch);
    if (!opts.apiKey) throw new Error("VercelGatewayLlm: missing API key (AI_GATEWAY_API_KEY)");
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? GATEWAY_SMALL_MODEL;
    this.url = opts.url ?? GATEWAY_URL;
  }

  protected async complete(req: CompletionRequest): Promise<LlmCallResult<string>> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [{ role: "user", content: req.prompt }],
      temperature: 0,
      max_tokens: req.maxOutputTokens,
      stream: false,
    };
    if (req.json) body.response_format = { type: "json_object" };

    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });
    const data = (await readBodyOrThrow(res, "vercel-gateway")) as GatewayResponse;

    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new Error(
        `vercel-gateway returned no text (finish_reason: ${data.choices?.[0]?.finish_reason ?? "unknown"})`,
      );
    }
    return {
      value: text,
      usage: {
        tokensIn: usageInt(data.usage?.prompt_tokens),
        tokensOut: usageInt(data.usage?.completion_tokens),
        model: this.model,
      },
    };
  }
}
