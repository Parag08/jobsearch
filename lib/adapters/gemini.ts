import { HttpLlmBase, readBodyOrThrow, usageInt, type CompletionRequest, type LlmCallResult } from "./llm-http";

export const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiOptions {
  apiKey: string;
  /** Free-tier flash model by default; override via GEMINI_MODEL. */
  model?: string;
  /** Injected so tests never hit the network. */
  fetch?: typeof fetch;
  /** Override for tests/proxies. */
  baseUrl?: string;
}

/** Shape of the Gemini generateContent response (only the parts we read). */
interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  promptFeedback?: { blockReason?: string };
}

/**
 * Gemini REST adapter (small tier, free-first). One POST per call:
 *   POST {base}/models/{model}:generateContent?key={apiKey}
 * JSON-mode via generationConfig.responseMimeType = "application/json".
 */
export class GeminiLlm extends HttpLlmBase {
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: GeminiOptions) {
    super(opts.fetch ?? fetch);
    if (!opts.apiKey) throw new Error("GeminiLlm: missing API key (GEMINI_API_KEY)");
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? GEMINI_DEFAULT_MODEL;
    this.baseUrl = opts.baseUrl ?? GEMINI_BASE_URL;
  }

  protected async complete(req: CompletionRequest): Promise<LlmCallResult<string>> {
    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const generationConfig: Record<string, unknown> = {
      temperature: 0,
      maxOutputTokens: req.maxOutputTokens,
    };
    if (req.json) generationConfig.responseMimeType = "application/json";

    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        generationConfig,
      }),
    });
    const data = (await readBodyOrThrow(res, "gemini")) as GeminiResponse;

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") {
      const why = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "unknown";
      throw new Error(`gemini returned no text (reason: ${why})`);
    }
    return {
      value: text,
      usage: {
        tokensIn: usageInt(data.usageMetadata?.promptTokenCount),
        tokensOut: usageInt(data.usageMetadata?.candidatesTokenCount),
        model: this.model,
      },
    };
  }
}
