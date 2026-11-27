import { createLlm } from "../adapters/llm-factory";
import type { LlmUsage, UsageListener, UsageReportingLlm } from "../adapters/llm-http";
import { streamGatewayText } from "../adapters/vercel-gateway-stream";
import { cannedText, lexicalExtract, type CannedContext, type CannedTask } from "../demo/canned";
import type { JdExtract } from "../types";
import type { DbClient } from "../repos/db";
import { takeAiCall } from "../repos/ai-calls";
import { AiCallLimitError } from "../adapters/llm-http";

export { AiCallLimitError };

/**
 * The one door every server action and route uses to reach a model. A demo visitor
 * (`cannedAi`) gets lib/demo/canned.ts instead and never reaches a provider, so the public
 * demo cannot spend a token; everyone else streams from the AI Gateway as before, within a
 * per-user limit on provider calls (AI_CALL_LIMIT per AI_CALL_WINDOW_SECONDS), so one account
 * cannot drain the deployment's shared key.
 */
export interface AiCaller {
  cannedAi: boolean;
  db: DbClient;
  userId: string;
}

type Env = Record<string, string | undefined>;

export interface AiCallLimit {
  calls: number;
  windowSeconds: number;
}

/** take_ai_call (migration 0025) never allows more than this per user per day. */
export const AI_CALL_CEILING = 5000;

export const AI_CALL_LIMIT_DEFAULT: AiCallLimit = { calls: 100, windowSeconds: 3600 };

const positiveInt = (v: string | undefined): number | null => {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : null;
};

/** The limit is deployment-wide: read from process.env only, never from a user's settings. */
export function aiCallLimitFromEnv(env: Env): AiCallLimit {
  return {
    calls: Math.min(positiveInt(env.AI_CALL_LIMIT) ?? AI_CALL_LIMIT_DEFAULT.calls, AI_CALL_CEILING),
    windowSeconds: Math.min(Math.max(positiveInt(env.AI_CALL_WINDOW_SECONDS) ?? AI_CALL_LIMIT_DEFAULT.windowSeconds, 60), 86_400),
  };
}

/** Count one provider call against the caller's window, or throw before the provider is reached. */
async function takeCall(w: AiCaller): Promise<void> {
  const d = await takeAiCall(w.db, w.userId, aiCallLimitFromEnv(process.env));
  if (!d.allowed) throw new AiCallLimitError(d.retryAfterSec);
}

/** Whether a model can answer at all: always in the demo, else only with a gateway key. */
export function aiReady(w: AiCaller, env: Env = process.env): boolean {
  return w.cannedAi || Boolean(env.AI_GATEWAY_API_KEY);
}

/** Pause before a canned reply, so the demo feels like a model answering rather than a page swap. */
const CANNED_DELAY_MS = 700;

export interface WriteOptions {
  model: string;
  prompt: string;
  json?: boolean;
  maxOutputTokens: number;
  /** A thinking model's effort (gateway `reasoning.effort`); unset = the model's default. */
  reasoningEffort?: string;
}

/** Stream one completion to a string - or, for a demo visitor, return the canned reply for `task`. */
export async function aiWrite(
  w: AiCaller,
  task: CannedTask,
  opts: WriteOptions,
  ctx: CannedContext = {},
  env: Env = process.env,
): Promise<string> {
  if (w.cannedAi) {
    await new Promise((r) => setTimeout(r, CANNED_DELAY_MS));
    return cannedText(task, ctx);
  }
  const apiKey = env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error("No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example).");
  await takeCall(w);
  let out = "";
  for await (const d of streamGatewayText({ apiKey, ...opts })) out += d;
  return out;
}

/** The posting reader: the routed provider (within the call limit), or for a demo visitor a rules-only reader (no tokens). */
export function aiLlm(w: AiCaller, demoTaxonomy: () => unknown, env: Env = process.env): UsageReportingLlm | null {
  if (w.cannedAi) return new RulesOnlyLlm(demoTaxonomy());
  const llm = createLlm(env);
  return llm ? withAiCallLimit(llm, w) : null;
}

/** Every call through `llm` first takes one call from the user's window; past it, the provider is never reached. */
export function withAiCallLimit(llm: UsageReportingLlm, w: AiCaller): UsageReportingLlm {
  return {
    get lastUsage() {
      return llm.lastUsage;
    },
    onUsage: (cb) => llm.onUsage(cb),
    extractJdMeasured: async (rawJd) => (await takeCall(w), llm.extractJdMeasured(rawJd)),
    summarizeNodeMeasured: async (nodeJson) => (await takeCall(w), llm.summarizeNodeMeasured(nodeJson)),
    extractJd: async (rawJd) => (await takeCall(w), llm.extractJd(rawJd)),
    summarizeNode: async (nodeJson) => (await takeCall(w), llm.summarizeNode(nodeJson)),
  };
}

const NO_USAGE: LlmUsage = { tokensIn: 0, tokensOut: 0, model: "demo" };

/** Reads a posting with lexicalExtract. Reports zero usage, which is the truth. */
export class RulesOnlyLlm implements UsageReportingLlm {
  readonly lastUsage: LlmUsage | null = null;
  constructor(private readonly taxonomy: unknown) {}
  onUsage(_cb: UsageListener): () => void {
    return () => undefined;
  }
  async extractJdMeasured(rawJd: string): Promise<{ value: JdExtract; usage: LlmUsage }> {
    return { value: lexicalExtract(rawJd, this.taxonomy), usage: NO_USAGE };
  }
  async summarizeNodeMeasured(_nodeJson: string): Promise<{ value: string; usage: LlmUsage }> {
    return { value: "", usage: NO_USAGE };
  }
  async extractJd(rawJd: string): Promise<JdExtract> {
    return (await this.extractJdMeasured(rawJd)).value;
  }
  async summarizeNode(nodeJson: string): Promise<string> {
    return (await this.summarizeNodeMeasured(nodeJson)).value;
  }
}
