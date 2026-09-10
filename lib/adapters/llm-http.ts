import { JdExtractSchema, type JdExtract } from "../types";
import type { LlmProvider } from "./llm";

/**
 * Shared plumbing for the real HTTP-backed LlmProviders (Gemini / Groq / Anthropic).
 * Everything here is pure or takes an injected `fetch` - no module ever touches the
 * network on its own, so the whole adapter layer stays unit-testable offline.
 */

export interface LlmUsage {
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export interface LlmCallResult<T> {
  value: T;
  usage: LlmUsage;
}

export type UsageListener = (usage: LlmUsage) => void;

/** An LlmProvider that also reports per-call token usage (token rule #6: every call logged). */
export interface UsageReportingLlm extends LlmProvider {
  /** Usage of the most recent completed call, or null before the first one. */
  readonly lastUsage: LlmUsage | null;
  /** Subscribe to per-call usage; returns an unsubscribe function. */
  onUsage(cb: UsageListener): () => void;
  /** Same as extractJd / summarizeNode but returning the usage alongside (safe under concurrency). */
  extractJdMeasured(rawJd: string): Promise<LlmCallResult<JdExtract>>;
  summarizeNodeMeasured(nodeJson: string): Promise<LlmCallResult<string>>;
}

/** Sector-node summaries are cached and reused (token rule #3); keep them short. */
export const SUMMARY_MAX_TOKENS = 150;

const JD_FIELD_SPEC = `{
  "company": string,            // hiring company name
  "role": string,               // job title as posted
  "roleFamily": string,         // kebab-case family, e.g. "product-management", "data-science", "engineering"
  "sectorPath": string[],       // industry > sub-domain > geography, e.g. ["IT", "AI", "Singapore"]; at least 1 item
  "skills": string[],           // concrete hard skills / tools required, lowercase
  "keywords": string[],         // other recurring domain terms, lowercase
  "seniority": string | null,   // e.g. "senior", "lead", "director"; null if not stated
  "visaNote": string | null,    // any visa / work-pass / sponsorship statement; null if none
  "location": string | null     // city or country as stated; null if not stated
}`;

/** Prompt for LlmProvider.extractJd: STRICT JSON matching JdExtractSchema, nothing else. */
export function buildJdExtractPrompt(rawJd: string): string {
  return [
    "You are a strict information extractor for job descriptions.",
    "Return ONLY a single JSON object matching exactly this shape (all nine keys present, no extras):",
    JD_FIELD_SPEC,
    "Rules:",
    "- sectorPath is a path: industry > sub-domain > geography (broadest first). Use the JD's own terms.",
    "- Every key must be present. Use null (not an empty string, not omission) when a nullable field is unknown.",
    "- Arrays may be empty but must be arrays of strings.",
    "- Output the JSON only: no prose, no markdown fences, no explanation.",
    "",
    "JOB DESCRIPTION:",
    "<<<",
    rawJd,
    ">>>",
  ].join("\n");
}

/** Prompt for LlmProvider.summarizeNode: a compact plain-text summary of a sector node. */
export function buildSummarizePrompt(nodeJson: string): string {
  return [
    "Summarize this job-market sector node for a job seeker.",
    `Write plain text only (no markdown, no JSON, no headings), at most ${SUMMARY_MAX_TOKENS} tokens.`,
    "Cover: what the sector hires for, the most demanded skills, and typical titles/companies.",
    "",
    "SECTOR NODE (JSON):",
    nodeJson,
  ].join("\n");
}

/**
 * Parse model output as JSON, tolerating ```json fences and prose before/after the
 * first `{`/`[` ... matching last `}`/`]`. Throws a descriptive Error otherwise.
 */
export function parseJsonLoose(text: string): unknown {
  let s = text.trim();
  // Strip a fenced block if the whole thing (or its core) is fenced.
  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  if (s.length === 0) throw new Error("LLM response contained no JSON (empty output)");

  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  const starts = [firstObj, firstArr].filter((i) => i >= 0);
  if (starts.length === 0) throw new Error(`LLM response contained no JSON: ${preview(s)}`);
  const start = Math.min(...starts);
  const closer = s[start] === "{" ? "}" : "]";
  const end = s.lastIndexOf(closer);
  if (end < start) throw new Error(`LLM response contained invalid JSON (unterminated): ${preview(s)}`);

  const candidate = s.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    throw new Error(`LLM response contained invalid JSON: ${(e as Error).message}; text: ${preview(candidate)}`);
  }
}

/** Validate parsed JSON against JdExtractSchema; the error names the offending field(s). */
export function validateJdExtract(json: unknown): JdExtract {
  const r = JdExtractSchema.safeParse(json);
  if (r.success) return r.data;
  const issues = r.error.issues
    .map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("; ");
  throw new Error(`LLM output is not a valid JdExtract - ${issues}`);
}

/** Non-2xx from a provider. `status` lets callers distinguish quota (429) from auth (401/403) etc. */
export class LlmHttpError extends Error {
  readonly status: number;
  readonly provider: string;
  readonly body: string;
  constructor(provider: string, status: number, body: string) {
    super(`${provider} request failed with HTTP ${status}: ${preview(body)}`);
    this.name = "LlmHttpError";
    this.provider = provider;
    this.status = status;
    this.body = body;
  }
}

/** Read a provider Response: throw LlmHttpError on non-2xx, parse JSON on 2xx. */
export async function readBodyOrThrow(res: Response, provider: string): Promise<unknown> {
  const text = await res.text();
  if (!res.ok) throw new LlmHttpError(provider, res.status, text);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${provider} returned HTTP ${res.status} but the body is not valid JSON: ${preview(text)}`);
  }
}

function preview(s: string, n = 200): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}...` : t;
}

/** What a concrete provider needs to ask its API for one completion. */
export interface CompletionRequest {
  prompt: string;
  /** Ask the API for JSON-mode output when it supports it. */
  json: boolean;
  maxOutputTokens: number;
}

/**
 * Base for the HTTP providers: owns the prompt -> parse -> validate pipeline and the
 * usage bookkeeping, so each concrete adapter only implements `complete()` (one API call).
 */
export abstract class HttpLlmBase implements UsageReportingLlm {
  private _lastUsage: LlmUsage | null = null;
  private listeners: UsageListener[] = [];

  /** Token headroom for the JD extract (it is JSON; ~400 tokens is typical, cap well above). */
  protected extractMaxOutputTokens = 1024;
  /** A little over SUMMARY_MAX_TOKENS so the model can finish its last sentence. */
  protected summaryMaxOutputTokens = SUMMARY_MAX_TOKENS + 50;

  protected constructor(protected readonly fetchImpl: typeof fetch) {}

  /** The single API call; returns the raw text of the completion plus usage. */
  protected abstract complete(req: CompletionRequest): Promise<LlmCallResult<string>>;

  get lastUsage(): LlmUsage | null {
    return this._lastUsage;
  }

  onUsage(cb: UsageListener): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  protected record(usage: LlmUsage): void {
    this._lastUsage = usage;
    for (const l of this.listeners) l(usage);
  }

  async extractJdMeasured(rawJd: string): Promise<LlmCallResult<JdExtract>> {
    const { value: text, usage } = await this.complete({
      prompt: buildJdExtractPrompt(rawJd),
      json: true,
      maxOutputTokens: this.extractMaxOutputTokens,
    });
    this.record(usage);
    return { value: validateJdExtract(parseJsonLoose(text)), usage };
  }

  async summarizeNodeMeasured(nodeJson: string): Promise<LlmCallResult<string>> {
    const { value: text, usage } = await this.complete({
      prompt: buildSummarizePrompt(nodeJson),
      json: false,
      maxOutputTokens: this.summaryMaxOutputTokens,
    });
    this.record(usage);
    return { value: text.trim(), usage };
  }

  async extractJd(rawJd: string): Promise<JdExtract> {
    return (await this.extractJdMeasured(rawJd)).value;
  }

  async summarizeNode(nodeJson: string): Promise<string> {
    return (await this.summarizeNodeMeasured(nodeJson)).value;
  }
}

/** Coerce a possibly-missing numeric usage field to a non-negative integer. */
export function usageInt(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
}
