"use server";

import { envFor } from "@/lib/services/settings";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { aiReady, aiWrite } from "@/lib/services/ai-write";
import { parseJsonLoose, retryAfterSeconds } from "@/lib/adapters/llm-http";
import { GATEWAY_PREMIUM_MODEL } from "@/lib/adapters/vercel-gateway";
import { logTokens } from "@/lib/repos/token-ledger";
import { estimateTokens } from "@/lib/token-meter";
import { fullInterviewSettingsFromEnv } from "@/lib/interview/full-plan";
import {
  applyFullTurn,
  buildFullDebriefPrompt,
  canScoreFull,
  closeFull,
  currentTopicId,
  fallbackReply,
  legalMoves,
  needsModel,
  parseFullDebrief,
  parseFullSession,
  startFull,
  topicsAsked,
  turnConflict,
  type FullReply,
  type FullSession,
  type Moment,
  type TopicVerdict,
} from "@/lib/interview/full-session";
import { TONES, type Tone } from "@/lib/interview/mock";
import { deliverySignals, numberDrift, overallScore, type DeliverySignals, type Scores } from "@/lib/interview/score";
import { fillerLine, fillerReport, hedgeCounts, parseVoiceSummary, voicePromptLine, type FillerReport, type VoiceSummary } from "@/lib/interview/voice";
import { buildRolePlayPrompt, guardRolePlay, likelyFollowUps, parseRolePlay, rolePlayBasis, type RolePlay } from "@/lib/interview/role-play";
import { fullPlanFor } from "@/lib/services/full-interview";
import { interviewerModels } from "@/lib/interview/interviewer-model";
import { chooseFullReply, type CallModel } from "@/lib/interview/full-turn";
import { writtenAnswerText } from "@/lib/services/role-plays";
import { listInterviewerRatings, type LineRating } from "@/lib/repos/interviewer-ratings";
import { rateLine } from "@/lib/services/interviewer-eval";
import { createFullSession, discardFullSession, finishFullSession, getFullSession, saveFullSession } from "@/lib/repos/full-sessions";
import { listModelAnswers } from "@/lib/repos/model-answers";
import { putRolePlay } from "@/lib/repos/role-plays";
import { findQuestion } from "./bank";

/**
 * Server actions for the full mock interview and role-plays (docs/FULL-INTERVIEW.md). Every model
 * call goes through aiWrite (the demo gets canned replies) and is logged to the token ledger,
 * with tokens estimated from the prompt and reply because the streaming endpoint reports none.
 */

async function ws() {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  return w;
}

const today = () => new Date().toISOString().slice(0, 10);
const NO_AI = "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example).";
const OFF = "The full interview is off. Set INTERVIEW_FULL_MAX_TOPICS, INTERVIEW_FULL_TOPIC_FOLLOW_UPS and INTERVIEW_FULL_TOTAL_FOLLOW_UPS (see .env.example).";

/** Choosing the next branch is judgement: its own tier, else premium (token rule #5). */
const premiumModel = (env: Record<string, string | undefined>) => env.AI_GATEWAY_PREMIUM_MODEL || GATEWAY_PREMIUM_MODEL;

type W = Awaited<ReturnType<typeof ws>>;
async function ledger(w: W, module: string, model: string, prompt: string, out: string) {
  await logTokens(w.db, w.userId, {
    date: today(),
    module,
    model: w.cannedAi ? "demo" : model,
    tokensIn: w.cannedAi ? 0 : estimateTokens(prompt),
    tokensOut: w.cannedAi ? 0 : estimateTokens(out),
  }).catch(() => undefined);
}

async function modelAnswersFor(w: W, s: FullSession): Promise<Record<string, string>> {
  const ids = new Set(s.plan.topics.map((t) => t.id));
  const all = await listModelAnswers(w.db, w.userId).catch(() => []);
  return Object.fromEntries(all.filter((m) => ids.has(m.questionId)).map((m) => [m.questionId, m.text]));
}

export interface FullTurnResult {
  error?: string;
  retryAfter?: number;
  sessionId?: string;
  session?: FullSession;
  /** Set when the answer was not applied because the session had already moved on (a double submit). */
  ignored?: "stale" | "duplicate";
  /** Where the time went on the server, in ms, for the latency check (docs/FULL-INTERVIEW.md). */
  timing?: { load: number; model: number; save: number; total: number };
}

/** Start a full interview for one application. The first question is asked by code - no model call. */
export async function startFullAction(input: { applicationId: string | null; tone: Tone }): Promise<FullTurnResult> {
  const w = await ws();
  const settings = fullInterviewSettingsFromEnv(await envFor(w.db, w.userId));
  if (!settings) return { error: OFF };
  if (!TONES.includes(input.tone)) return { error: "Unknown tone." };
  const plan = await fullPlanFor(w.db, w.userId, input.applicationId, settings);
  if (!plan) return { error: "That application has no questions to interview on." };
  const stored = await createFullSession(w.db, w.userId, startFull(plan, settings, input.tone, new Date().toISOString()));
  return { sessionId: stored.id, session: stored.session };
}

/** Pick up a running interview after a refresh. */
export async function resumeFullAction(sessionId: string): Promise<FullTurnResult> {
  const w = await ws();
  const stored = await getFullSession(w.db, w.userId, sessionId);
  if (!stored) return { error: "That interview could not be found." };
  return { sessionId: stored.id, session: parseFullSession(stored.session) };
}

/**
 * One answer in, the interviewer's next line out. Code lists the legal moves; the model picks
 * one and phrases it only when there is a real choice; guards replace anything illegal or
 * invented; a failed call falls back to code's first choice. Saved every turn.
 */
export async function fullTurnAction(input: { sessionId: string; answer: string; turns?: number; cutIn?: boolean }): Promise<FullTurnResult> {
  const t0 = Date.now();
  const w = await ws();
  const stored = await getFullSession(w.db, w.userId, input.sessionId);
  if (!stored) return { error: "That interview could not be found." };
  const s = parseFullSession(stored.session);
  if (s.status === "done") return { error: "This interview has finished." };
  const answer = input.answer.trim();
  if (!answer) return { error: "Say or type something first." };
  // A retry or a second send of the same answer must not be recorded twice (20 Nov).
  const conflict = turnConflict(s, input.turns, answer);
  if (conflict) return { sessionId: stored.id, session: s, ignored: conflict };

  const topicId = currentTopicId(s);
  const written = await writtenAnswerText(w.db, w.userId, topicId);
  const legal = legalMoves(s, answer, written);
  let reply: FullReply = fallbackReply(legal);
  const t1 = Date.now();

  let usedModel = "code";
  if (needsModel(legal)) {
    if (!aiReady(w)) return { error: NO_AI };
    // The interviewer model first (its own effort and cap), then premium once if it fails.
    const call: CallModel = async (m, prompt) => {
      const out = await aiWrite(
        w,
        "full-turn",
        { model: m.model, prompt, json: true, maxOutputTokens: m.maxOutputTokens, reasoningEffort: m.reasoningEffort },
        { candidates: legal },
      );
      void ledger(w, "interview-full-turn", m.model, prompt, out);
      return out;
    };
    // Logged so a failing model is visible, not silently replaced by code's stock line.
    const onFail = (model: string, err: unknown) =>
      console.error(`[full-turn] ${model} failed: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`);
    try {
      const choice = await chooseFullReply({ session: s, latest: answer, legal, cutIn: input.cutIn }, interviewerModels(await envFor(w.db, w.userId)), call, onFail);
      reply = choice.reply;
      usedModel = w.cannedAi && choice.model !== "code" ? "demo" : choice.model;
    } catch (err) {
      const wait = retryAfterSeconds(err);
      if (wait !== null) return { error: `The interviewer is catching up - trying again in ${wait}s.`, retryAfter: wait };
      throw err;
    }
  }
  const t2 = Date.now();

  const next = applyFullTurn(s, answer, reply, new Date().toISOString());
  await saveFullSession(w.db, w.userId, stored.id, next);
  const t3 = Date.now();
  const timing = { load: t1 - t0, model: t2 - t1, save: t3 - t2, total: t3 - t0 };
  console.info(`[full-turn] load=${timing.load}ms model=${timing.model}ms save=${timing.save}ms total=${timing.total}ms move=${reply.move} model=${usedModel}`);
  return { sessionId: stored.id, session: next, timing };
}

/** Discard a running interview: no debrief, nothing kept. A finished one stays a report. */
export async function discardFullAction(sessionId: string): Promise<{ error?: string }> {
  const w = await ws();
  const removed = await discardFullSession(w.db, w.userId, sessionId);
  revalidatePath("/app/interview");
  return removed ? {} : { error: "That interview has already finished, so it was kept." };
}

export interface FullDebriefResult {
  error?: string;
  sessionId?: string;
  session?: FullSession;
  overall?: number;
  scores?: Scores;
  strengths?: string[];
  improvements?: string[];
  perTopic?: TopicVerdict[];
  moments?: Moment[];
  signals?: DeliverySignals;
  saidNotWritten?: string[];
  fillers?: FillerReport;
  voice?: VoiceSummary | null;
  hedges?: Record<string, number>;
  model?: string;
  /** Your ratings of the interviewer's lines, by turn index. */
  ratings?: Record<number, { rating: LineRating; better: string | null }>;
}

/** End (if still running) and score the whole interview: one premium call. */
export async function finishFullAction(input: { sessionId: string; answer?: string; voice?: unknown }): Promise<FullDebriefResult> {
  const w = await ws();
  const stored = await getFullSession(w.db, w.userId, input.sessionId);
  if (!stored) return { error: "That interview could not be found." };
  let s = parseFullSession(stored.session);
  if (s.status === "running") {
    s = closeFull(s, input.answer ?? null, new Date().toISOString());
    await saveFullSession(w.db, w.userId, stored.id, s);
  }
  if (!canScoreFull(s)) return { error: "There is not enough to give feedback on yet - answer a question first.", sessionId: stored.id, session: s };
  if (!aiReady(w)) return { error: NO_AI, sessionId: stored.id, session: s };

  const said = s.turns.filter((t) => t.role === "candidate").map((t) => t.text).join(" ");
  const first = s.turns.find((t) => t.role === "candidate")?.text ?? "";
  const modelAnswers = await modelAnswersFor(w, s);
  const writtenAll = (await Promise.all(topicsAsked(s).map((id) => writtenAnswerText(w.db, w.userId, id)))).join(" ");
  const { saidNotWritten } = numberDrift(said, [writtenAll, ...Object.values(modelAnswers)].join(" "));
  const fillers = fillerReport(said);
  const voice = parseVoiceSummary(input.voice);
  const hedges = hedgeCounts(said);
  const model = w.cannedAi ? "demo" : premiumModel(await envFor(w.db, w.userId));
  const prompt = buildFullDebriefPrompt({ session: s, modelAnswers, delivery: voicePromptLine(voice, hedges), fillers: fillerLine(fillers) });

  let debrief;
  try {
    const out = await aiWrite(w, "full-debrief", { model, prompt, json: true, maxOutputTokens: 1600 }, { topicIds: topicsAsked(s), firstAnswer: first });
    await ledger(w, "interview-full-debrief", model, prompt, out);
    debrief = parseFullDebrief(parseJsonLoose(out), s, modelAnswers);
  } catch (err) {
    return { error: err instanceof Error ? `Could not score the interview: ${err.message}` : "Could not score the interview.", sessionId: stored.id, session: s };
  }

  const overall = overallScore(debrief.scores);
  await finishFullSession(w.db, w.userId, stored.id, { session: s, ...debrief, overall, model });
  revalidatePath("/app/interview");
  return {
    sessionId: stored.id,
    session: s,
    overall,
    ...debrief,
    signals: deliverySignals(first, null),
    saidNotWritten,
    fillers,
    voice,
    hedges,
    model,
  };
}

/** A finished interview's saved debrief, to show it again. */
export async function fullDebriefAction(sessionId: string): Promise<FullDebriefResult> {
  const w = await ws();
  const stored = await getFullSession(w.db, w.userId, sessionId);
  if (!stored || stored.status !== "done" || !stored.scores || stored.overall === null) return { error: "No debrief for that interview yet." };
  return {
    sessionId: stored.id,
    session: parseFullSession(stored.session),
    overall: stored.overall,
    scores: stored.scores,
    strengths: stored.strengths,
    improvements: stored.improvements,
    perTopic: stored.perTopic,
    moments: stored.moments,
    model: stored.model,
    ratings: Object.fromEntries(
      (await listInterviewerRatings(w.db, w.userId, stored.id).catch(() => [])).map((r) => [r.turnIndex, { rating: r.rating, better: r.better }]),
    ),
  };
}

/**
 * Rate one interviewer line good or bad (null clears it), with what it should have asked. The
 * labels of the interviewer eval set: GET /api/interview-eval, then `npm run interview:eval`.
 */
export async function rateLineAction(input: { sessionId: string; turnIndex: number; rating: LineRating | null; better?: string | null }): Promise<{ error?: string }> {
  const w = await ws();
  if (input.rating !== null && input.rating !== "good" && input.rating !== "bad") return { error: "Unknown rating." };
  const r = await rateLine(w.db, w.userId, input);
  return r.ok ? {} : { error: r.error };
}

// ---- role-plays ----------------------------------------------------------------------------

export interface RolePlayResult {
  error?: string;
  rolePlay?: RolePlay;
}

/** Build (or rebuild) the role-play for one question from its model answer: one premium call, then cached. */
export async function buildRolePlayAction(questionId: string): Promise<RolePlayResult> {
  const w = await ws();
  const found = await findQuestion(w.db, w.userId, questionId);
  if (!found) return { error: "Unknown question." };
  const modelAnswer = found.modelAnswer?.trim();
  if (!modelAnswer) return { error: "Write or rewrite a model answer first - the role-play is built from it." };
  if (!aiReady(w)) return { error: NO_AI };

  const { question } = found;
  const followUps = likelyFollowUps(modelAnswer);
  const model = premiumModel(await envFor(w.db, w.userId));
  const prompt = buildRolePlayPrompt({
    question: question.text,
    lookFor: question.lookFor,
    interviewer: found.interviewer ?? null,
    context: found.context,
    contextLabel: found.contextLabel ?? null,
    modelAnswer,
    followUps,
  });
  let lines;
  try {
    const out = await aiWrite(w, "role-play", { model, prompt, json: true, maxOutputTokens: 1400 }, { modelAnswer, candidates: followUps });
    await ledger(w, "interview-role-play", model, prompt, out);
    lines = parseRolePlay(parseJsonLoose(out), question.text);
  } catch (err) {
    return { error: err instanceof Error ? `Could not build the role-play: ${err.message}` : "Could not build the role-play." };
  }
  const check = guardRolePlay(lines, { modelAnswer, written: await writtenAnswerText(w.db, w.userId, questionId) });
  if (!check.ok) return { error: `Not saved: the role-play stated ${check.invented.join(", ")}, which your model answer does not. Try again.` };

  const saved = await putRolePlay(
    w.db,
    w.userId,
    { questionId, lines: check.lines, source: "ai", basedOn: rolePlayBasis(modelAnswer), model: w.cannedAi ? "demo" : model },
    new Date().toISOString(),
  );
  revalidatePath("/app/interview");
  return { rolePlay: saved };
}
