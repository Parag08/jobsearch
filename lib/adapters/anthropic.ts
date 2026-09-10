import { HttpLlmBase, readBodyOrThrow, usageInt, type CompletionRequest, type LlmCallResult } from "./llm-http";

export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-5";
export const ANTHROPIC_API_VERSION = "2023-06-01";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export interface AnthropicOptions {
  apiKey: string;
  /** Override via ANTHROPIC_MODEL. */
  model?: string;
  /** Injected so tests never hit the network. */
  fetch?: typeof fetch;
  /** Override for tests/proxies. */
  url?: string;
}

/** Messages API response (only the parts we read). */
interface AnthropicResponse {
  content?: { type?: string; text?: string }[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Anthropic Messages API adapter - the PREMIUM tier (routeModel: polish-cv, draft-outreach).
 * Opt-in only (free-first rule): the factory never picks it for the small tier unless it is
 * the only key configured. extractJd/summarizeNode exist for interface completeness.
 * The Messages API has no JSON mode, so extraction relies on the strict prompt + parseJsonLoose.
 */
export class AnthropicLlm extends HttpLlmBase {
  readonly model: string;
  private readonly apiKey: string;
  private readonly url: string;

  constructor(opts: AnthropicOptions) {
    super(opts.fetch ?? fetch);
    if (!opts.apiKey) throw new Error("AnthropicLlm: missing API key (ANTHROPIC_API_KEY)");
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? ANTHROPIC_DEFAULT_MODEL;
    this.url = opts.url ?? ANTHROPIC_URL;
  }

  protected async complete(req: CompletionRequest): Promise<LlmCallResult<string>> {
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxOutputTokens,
        temperature: 0,
        stream: false,
        messages: [{ role: "user", content: req.prompt }],
      }),
    });
    const data = (await readBodyOrThrow(res, "anthropic")) as AnthropicResponse;

    const block = data.content?.find((b) => b.type === "text" && typeof b.text === "string") ?? data.content?.[0];
    const text = block?.text;
    if (typeof text !== "string") {
      throw new Error(`anthropic returned no text (stop_reason: ${data.stop_reason ?? "unknown"})`);
    }
    return {
      value: text,
      usage: {
        tokensIn: usageInt(data.usage?.input_tokens),
        tokensOut: usageInt(data.usage?.output_tokens),
        model: this.model,
      },
    };
  }
}
