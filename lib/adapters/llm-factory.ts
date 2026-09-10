import type { JdExtract } from "../types";
import { AnthropicLlm } from "./anthropic";
import { GeminiLlm } from "./gemini";
import { GroqLlm } from "./groq";
import { routeModel, type LlmTask } from "./llm";
import { VercelGatewayLlm, GATEWAY_PREMIUM_MODEL, GATEWAY_SMALL_MODEL } from "./vercel-gateway";
import type { LlmCallResult, LlmUsage, UsageListener, UsageReportingLlm } from "./llm-http";

/**
 * Wiring for the real providers. Env var names read here (append to .env.example, never rename):
 *   GEMINI_API_KEY, GEMINI_MODEL   - small tier, first choice (free tier)
 *   GROQ_API_KEY, GROQ_MODEL       - small tier, fallback (free tier)
 *   ANTHROPIC_API_KEY, ANTHROPIC_MODEL - premium tier, opt-in (paid)
 */
export type LlmEnv = Record<string, string | undefined>;

export interface RoutedLlmProviders {
  small: UsageReportingLlm;
  premium: UsageReportingLlm;
}

/**
 * One LlmProvider that dispatches per task via routeModel (token rule #5). The
 * LlmProvider interface only carries small-tier tasks today; premium-tier callers
 * (polish-cv, draft-outreach) reach their provider through providerFor(task).
 */
export class RoutedLlm implements UsageReportingLlm {
  readonly small: UsageReportingLlm;
  readonly premium: UsageReportingLlm;
  private _lastUsage: LlmUsage | null = null;
  private listeners: UsageListener[] = [];

  constructor({ small, premium }: RoutedLlmProviders) {
    this.small = small;
    this.premium = premium;
    const forward: UsageListener = (u) => {
      this._lastUsage = u;
      for (const l of this.listeners) l(u);
    };
    small.onUsage(forward);
    if (premium !== small) premium.onUsage(forward);
  }

  providerFor(task: LlmTask): UsageReportingLlm {
    return routeModel(task).tier === "premium" ? this.premium : this.small;
  }

  get lastUsage(): LlmUsage | null {
    return this._lastUsage;
  }

  onUsage(cb: UsageListener): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  extractJdMeasured(rawJd: string): Promise<LlmCallResult<JdExtract>> {
    return this.providerFor("extract-jd").extractJdMeasured(rawJd);
  }
  summarizeNodeMeasured(nodeJson: string): Promise<LlmCallResult<string>> {
    return this.providerFor("summarize-node").summarizeNodeMeasured(nodeJson);
  }
  extractJd(rawJd: string): Promise<JdExtract> {
    return this.providerFor("extract-jd").extractJd(rawJd);
  }
  summarizeNode(nodeJson: string): Promise<string> {
    return this.providerFor("summarize-node").summarizeNode(nodeJson);
  }
}

function key(env: LlmEnv, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

/**
 * Build the routed provider from env. Free-first:
 *   small   = Gemini if GEMINI_API_KEY, else Groq if GROQ_API_KEY, else (only option) Anthropic
 *   premium = Anthropic if ANTHROPIC_API_KEY, else the small-tier provider
 * Returns null when no key is set at all - callers 503 or fall back to FakeLlm.
 */
export function createLlm(env: LlmEnv, fetchImpl: typeof fetch = fetch): RoutedLlm | null {
  // The gateway wins when present: one key reaches every provider and the spend comes
  // out of the credit included with the Vercel plan, so free-first (rule 5) holds
  // without juggling a key per provider. Tiers differ only by model.
  const gateway = key(env, "AI_GATEWAY_API_KEY");
  if (gateway) {
    const make = (model: string) => new VercelGatewayLlm({ apiKey: gateway, model, fetch: fetchImpl });
    return new RoutedLlm({
      small: make(key(env, "AI_GATEWAY_SMALL_MODEL") ?? GATEWAY_SMALL_MODEL),
      premium: make(key(env, "AI_GATEWAY_PREMIUM_MODEL") ?? GATEWAY_PREMIUM_MODEL),
    });
  }

  const gemini = key(env, "GEMINI_API_KEY");
  const groq = key(env, "GROQ_API_KEY");
  const anthropic = key(env, "ANTHROPIC_API_KEY");

  const premiumOnly = anthropic
    ? new AnthropicLlm({ apiKey: anthropic, model: key(env, "ANTHROPIC_MODEL"), fetch: fetchImpl })
    : null;

  const small = gemini
    ? new GeminiLlm({ apiKey: gemini, model: key(env, "GEMINI_MODEL"), fetch: fetchImpl })
    : groq
      ? new GroqLlm({ apiKey: groq, model: key(env, "GROQ_MODEL"), fetch: fetchImpl })
      : premiumOnly;

  if (!small) return null;
  return new RoutedLlm({ small, premium: premiumOnly ?? small });
}

/** What withLedger hands to the caller's logger; the caller adds date + user_id (repos/token-ledger.logTokens). */
export interface LedgerEvent {
  module: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}
export type LedgerLogFn = (event: LedgerEvent) => void | Promise<void>;

/** token_ledger.module per LlmProvider method - the service that owns each call. */
export const LEDGER_MODULES = {
  extractJd: "process-jd",
  summarizeNode: "sector-graph",
} as const;

/** Wrap a provider so every successful call's usage is logged (token rule #6). Failed calls log nothing. */
export function withLedger(llm: UsageReportingLlm, logFn: LedgerLogFn): UsageReportingLlm {
  const log = async (module: string, usage: LlmUsage) => {
    await logFn({ module, model: usage.model, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut });
  };
  return {
    get lastUsage() {
      return llm.lastUsage;
    },
    onUsage: (cb) => llm.onUsage(cb),
    async extractJdMeasured(rawJd) {
      const r = await llm.extractJdMeasured(rawJd);
      await log(LEDGER_MODULES.extractJd, r.usage);
      return r;
    },
    async summarizeNodeMeasured(nodeJson) {
      const r = await llm.summarizeNodeMeasured(nodeJson);
      await log(LEDGER_MODULES.summarizeNode, r.usage);
      return r;
    },
    async extractJd(rawJd) {
      return (await this.extractJdMeasured(rawJd)).value;
    },
    async summarizeNode(nodeJson) {
      return (await this.summarizeNodeMeasured(nodeJson)).value;
    },
  };
}
