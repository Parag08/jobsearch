import { createLlm, type RoutedLlm } from "../adapters/llm-factory";
import type { LlmUsage, UsageListener, UsageReportingLlm } from "../adapters/llm-http";
import { streamGatewayText } from "../adapters/vercel-gateway-stream";
import { cannedText, lexicalExtract, type CannedContext, type CannedTask } from "../demo/canned";
import type { JdExtract } from "../types";

/**
 * The one door every server action and route uses to reach a model. A demo visitor
 * (`cannedAi`) gets lib/demo/canned.ts instead and never reaches a provider, so the public
 * demo cannot spend a token; everyone else streams from the AI Gateway as before.
 */
export interface AiCaller {
  cannedAi: boolean;
}

type Env = Record<string, string | undefined>;

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
  let out = "";
  for await (const d of streamGatewayText({ apiKey, ...opts })) out += d;
  return out;
}

/** The posting reader: the routed provider, or for a demo visitor a rules-only reader (no tokens). */
export function aiLlm(w: AiCaller, demoTaxonomy: () => unknown, env: Env = process.env): RoutedLlm | UsageReportingLlm | null {
  return w.cannedAi ? new RulesOnlyLlm(demoTaxonomy()) : createLlm(env);
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
