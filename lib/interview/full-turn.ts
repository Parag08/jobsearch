import { AiCallLimitError, parseJsonLoose, retryAfterSeconds } from "../adapters/llm-http";
import {
  buildFullTurnPrompt,
  fallbackReply,
  guardFullReply,
  needsModel,
  parseFullReply,
  safeDefault,
  type FullReply,
  type FullSession,
  type Move,
} from "./full-session";
import type { InterviewerModel } from "./interviewer-model";

/**
 * One interviewer turn of a full interview, from the legal moves to the line that is said. The
 * app (fullTurnAction) and the interviewer eval (scripts/interviewer-eval.ts) both run this, so
 * the eval measures exactly what an interview does. The model call itself is injected.
 *
 * The models are tried in order (lib/interview/interviewer-model.ts); a rate limit stops at once
 * so the caller can ask the candidate to wait; when nothing usable comes back, code moves on.
 */

export type CallModel = (m: InterviewerModel, prompt: string) => Promise<string>;

export interface TurnChoice {
  reply: FullReply;
  /** The model that answered, or "code" when none was asked or none answered. */
  model: string;
  /** The model's own pick and line, before the guards repaired it: what the eval scores. */
  raw: { move: Move; say: string } | null;
}

export async function chooseFullReply(
  input: { session: FullSession; latest: string; legal: Move[]; cutIn?: boolean },
  models: InterviewerModel[],
  call: CallModel,
  onFail: (model: string, err: unknown) => void = () => undefined,
): Promise<TurnChoice> {
  const { session: s, latest, legal } = input;
  if (!needsModel(legal)) return { reply: fallbackReply(legal), model: "code", raw: null };
  // Never the model answer here: it is the debrief's yardstick only.
  const prompt = buildFullTurnPrompt(input);
  for (const m of models) {
    try {
      const parsed = parseFullReply(parseJsonLoose(await call(m, prompt)), legal);
      return { reply: guardFullReply(parsed, s, latest, legal), model: m.model, raw: { move: parsed.move, say: parsed.say } };
    } catch (err) {
      if (retryAfterSeconds(err) !== null || err instanceof AiCallLimitError) throw err;
      onFail(m.model, err);
    }
  }
  // Nothing usable: move on if the topic has had a follow-up, rather than a canned "why".
  return { reply: guardFullReply(fallbackReply([safeDefault(legal, s), ...legal]), s, latest, legal), model: "code", raw: null };
}
