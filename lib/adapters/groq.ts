import { HttpLlmBase, readBodyOrThrow, usageInt, type CompletionRequest, type LlmCallResult } from "./llm-http";

export const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface GroqOptions {
  apiKey: string;
  /** Override via GROQ_MODEL. */
  model?: string;
  /** Injected so tests never hit the network. */
  fetch?: typeof fetch;
  /** Override for tests/proxies. */
  url?: string;
}

/** OpenAI-compatible chat completion response (only the parts we read). */
interface GroqResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Groq adapter (small tier, free-first fallback when no Gemini key). OpenAI-compatible:
 *   POST https://api.groq.com/openai/v1/chat/completions  (Authorization: Bearer <key>)
 * JSON-mode via response_format {type:"json_object"} - Groq requires the word "JSON"
 * somewhere in the prompt for that mode, which buildJdExtractPrompt guarantees.
 */
export class GroqLlm extends HttpLlmBase {
  readonly model: string;
  private readonly apiKey: string;
  private readonly url: string;

  constructor(opts: GroqOptions) {
    super(opts.fetch ?? fetch);
    if (!opts.apiKey) throw new Error("GroqLlm: missing API key (GROQ_API_KEY)");
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? GROQ_DEFAULT_MODEL;
    this.url = opts.url ?? GROQ_URL;
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
    const data = (await readBodyOrThrow(res, "groq")) as GroqResponse;

    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new Error(`groq returned no text (finish_reason: ${data.choices?.[0]?.finish_reason ?? "unknown"})`);
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
