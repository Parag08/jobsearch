import { GATEWAY_PREMIUM_MODEL } from "../adapters/vercel-gateway";

/**
 * Which model conducts the full interview, in the order to try them.
 *
 * The interviewer's judgement IS the product: Mistral Medium (the premium fallback) asked
 * "why 10%?" three times running on 21 Nov. So the interviewer has its own model,
 * AI_GATEWAY_INTERVIEWER_MODEL, and for a thinking model its own effort
 * (AI_GATEWAY_INTERVIEWER_EFFORT, e.g. "low" to stay quick in a live voice call) and token cap
 * (AI_GATEWAY_INTERVIEWER_MAX_TOKENS, which must leave room for the thinking as well as the
 * one-line reply). If that model fails, the premium model is tried once, as before.
 */

export interface InterviewerModel {
  model: string;
  reasoningEffort?: string;
  maxOutputTokens: number;
}

/** A reply is one short JSON object: a move, one question, a private note. */
export const REPLY_TOKENS = 160;
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export function interviewerModels(env: Record<string, string | undefined>, premiumDefault: string = GATEWAY_PREMIUM_MODEL): InterviewerModel[] {
  const get = (k: string) => env[k]?.trim() || undefined;
  const premium: InterviewerModel = { model: get("AI_GATEWAY_PREMIUM_MODEL") ?? premiumDefault, maxOutputTokens: REPLY_TOKENS };
  const model = get("AI_GATEWAY_INTERVIEWER_MODEL");
  if (!model) return [premium];

  const effort = get("AI_GATEWAY_INTERVIEWER_EFFORT");
  const cap = get("AI_GATEWAY_INTERVIEWER_MAX_TOKENS");
  let first: InterviewerModel = { model, maxOutputTokens: REPLY_TOKENS };
  if (effort) {
    if (!EFFORTS.includes(effort)) throw new Error(`AI_GATEWAY_INTERVIEWER_EFFORT must be one of ${EFFORTS.join(", ")}, got "${effort}"`);
    const n = Number(cap);
    if (!cap) throw new Error("AI_GATEWAY_INTERVIEWER_MAX_TOKENS is needed with AI_GATEWAY_INTERVIEWER_EFFORT: the cap must cover the thinking too");
    if (!Number.isInteger(n) || n < REPLY_TOKENS * 4) throw new Error(`AI_GATEWAY_INTERVIEWER_MAX_TOKENS must be a whole number of at least ${REPLY_TOKENS * 4}, got "${cap}"`);
    first = { model, reasoningEffort: effort, maxOutputTokens: n };
  }
  return premium.model === model ? [first] : [first, premium];
}
