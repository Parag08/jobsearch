"use server";

import { envFor } from "@/lib/services/settings";
import { interviewerModels } from "@/lib/interview/interviewer-model";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { advance } from "@/lib/pipeline";
import { STAGES, type ClosedReason, type Stage } from "@/lib/types";
import { getApplication, updateApplication } from "@/lib/repos/applications";
import { markApplied } from "@/lib/services/mark-applied";
import { tailorCv } from "@/lib/services/tailor-cv";
import { cvPageSettingsFromEnv, cvSelectionSettingsFromEnv } from "@/lib/cv-page-settings";
import { draftCoverLetter, editCoverLetter } from "@/lib/services/cover-letter";
import { parseLetterBank } from "@/lib/cover-letter";
import letterBank from "@/data/cvbuilder/letter-bank.json";
import { listAnswers, saveAttempt, upsertAnswer } from "@/lib/repos/answers";
import { buildRewritePrompt, guardRewrite } from "@/lib/interview/model-answer";
import { setModelAnswer } from "@/lib/services/model-answers";
import { deliverySignals, numberDrift, overallScore, type DeliverySignals, type Scores } from "@/lib/interview/score";
import { parseJsonLoose, retryAfterSeconds } from "@/lib/adapters/llm-http";
import { findQuestion } from "./interview/bank";
import { cleanQuestionText, customQuestionId, customQuestionMaxCharsFromEnv, storedIdOf } from "@/lib/interview/custom-questions";
import { addCustomQuestion, removeCustomQuestion } from "@/lib/repos/custom-questions";
import { findCase } from "./interview/cases";
import {
  advance as advanceCase,
  applyTurn,
  buildDebriefPrompt,
  buildTurnPrompt,
  caseSignals,
  checkMath,
  currentQuestion,
  forcedAdvance,
  guardReply,
  overallCaseScore,
  parseDebrief,
  parseTurnReply,
  startSession,
  type CaseScores,
  type CaseSession,
  type CaseSignals,
} from "@/lib/interview/case-session";
import { createCaseSession, finishCaseSession, getCaseSession, saveCaseSession } from "@/lib/repos/case-sessions";
import {
  FOLLOW_UP_FALLBACK,
  applyFollowUp,
  buildFollowUpPrompt,
  buildMockDebriefPrompt,
  canScore,
  closeMock,
  guardFollowUp,
  mockTranscript,
  nextStep,
  parseFollowUp,
  parseMockDebrief,
  parseMockSession,
  startMock,
  type FollowUpVerdict,
  type ModelComparison,
  type MockSession,
  type Tone,
} from "@/lib/interview/mock";
import { fillerLine, fillerReport, hedgeCounts, parseVoiceSummary, voicePromptLine, type FillerReport, type VoiceSummary } from "@/lib/interview/voice";
import { aiLlm, aiReady, aiWrite } from "@/lib/services/ai-write";
import { readPostingInto } from "@/lib/services/save-to-pipeline";
import { applyFollowUpDaysFromEnv, followUpAfterApplying } from "@/lib/apply/follow-up";
import { demoTaxonomy } from "@/lib/db/demo";
import { GATEWAY_PREMIUM_MODEL, GATEWAY_SMALL_MODEL } from "@/lib/adapters/vercel-gateway";
import { withLedger } from "@/lib/adapters/llm-factory";
import type { LlmProvider } from "@/lib/adapters/llm";
import { logTokens } from "@/lib/repos/token-ledger";
import { processJd } from "@/lib/services/process-jd";
import { MAX_POSTING_CHARS, PostingTooLongError } from "@/lib/services/read-role";

async function ws() {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  return w;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Move an application; the applied transition goes through markApplied so the sent CV freezes. */
export async function moveStage(applicationId: string, to: Stage, closedReason?: ClosedReason): Promise<void> {
  const { db, userId, persistDemoKits } = await ws();
  if (!STAGES.includes(to)) return;
  if (to === "applied") {
    const { application } = await markApplied({ db }, userId, applicationId, new Date().toISOString());
    // Applied: the next step is the follow-up (docs/APPLY-FLOW.md step 5), unless one is set.
    const days = applyFollowUpDaysFromEnv((await envFor(db, userId)));
    if (days && !application.nextAction) {
      await updateApplication(db, userId, { ...application, nextAction: followUpAfterApplying(today(), days) });
    }
  } else {
    const app = await getApplication(db, userId, applicationId);
    if (!app) return;
    if (app.hasSourcingKit && !app.appliedAt && to !== "closed") return;
    await updateApplication(db, userId, advance(app, to, today(), closedReason));
    if (app.hasSourcingKit) await persistDemoKits?.();
  }
  revalidatePath("/app");
  revalidatePath(`/app/applications/${applicationId}`);
}

export async function setNextAction(applicationId: string, formData: FormData): Promise<void> {
  const { db, userId } = await ws();
  const app = await getApplication(db, userId, applicationId);
  if (!app || app.hasSourcingKit) return;
  const nextAction = String(formData.get("nextAction") ?? "").trim();
  await updateApplication(db, userId, { ...app, nextAction: nextAction || null, updatedAt: today() });
  revalidatePath("/app");
  revalidatePath(`/app/applications/${applicationId}`);
}

export async function tailorCvAction(applicationId: string): Promise<void> {
  const { db, userId } = await ws();
  let failure: string | null = null;
  try {
    await tailorCv(
      { db, page: cvPageSettingsFromEnv((await envFor(db, userId))), select: cvSelectionSettingsFromEnv((await envFor(db, userId))) },
      userId,
      applicationId,
      today(),
    );
  } catch (e) {
    console.error("tailorCvAction", e);
    failure = e instanceof Error ? e.message.replace(/^tailorCv:\s*/, "") : "Tailoring failed.";
  }
  if (failure) redirect(`/app/applications/${applicationId}?cvError=${encodeURIComponent(failure)}#cv`);
  revalidatePath(`/app/applications/${applicationId}`);
}

/** Where the letter form sends errors back: the application page, with a readable message. */
function letterError(applicationId: string, message: string): never {
  redirect(`/app/applications/${applicationId}?letterError=${encodeURIComponent(message)}#cover-letter`);
}

/**
 * Draft the cover letter (ROADMAP Now #4). Writing the user reads, so the premium tier
 * (token rule #5). Without the firm detail the service asks instead of calling the model.
 */
export async function draftCoverLetterAction(applicationId: string, formData: FormData): Promise<void> {
  const w = await ws();
  const { db, userId } = w;
  const inputs = {
    firmDetail: String(formData.get("firmDetail") ?? ""),
    recipient: String(formData.get("recipient") ?? ""),
    teamName: String(formData.get("teamName") ?? ""),
  };
  if (!aiReady(w)) letterError(applicationId, "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example).");
  const model = (await envFor(db, userId)).AI_GATEWAY_PREMIUM_MODEL ?? GATEWAY_PREMIUM_MODEL;
  const write = (prompt: string) => aiWrite(w, "cover-letter", { model, prompt, json: false, maxOutputTokens: 1200 });

  let message: string | null = null;
  try {
    const result = await draftCoverLetter(
      { db, write, bank: parseLetterBank(letterBank), model },
      userId,
      applicationId,
      inputs,
      today(),
    );
    if ("needs" in result) message = "Add one specific thing about the firm first - the letter will not invent one.";
    else await logTokens(db, userId, { date: today(), module: "cover-letter", model, tokensIn: 0, tokensOut: 0 }).catch(() => undefined);
  } catch (err) {
    const wait = retryAfterSeconds(err);
    message = wait !== null ? `The writer is busy - try again in ${wait}s.` : err instanceof Error ? err.message : "Drafting failed.";
  }
  if (message) letterError(applicationId, message);
  revalidatePath(`/app/applications/${applicationId}`);
}

/** Save the user's edit of the letter body and re-run the voice checks. */
export async function editCoverLetterAction(applicationId: string, formData: FormData): Promise<void> {
  const { db, userId } = await ws();
  try {
    await editCoverLetter({ db, bank: parseLetterBank(letterBank) }, userId, applicationId, String(formData.get("body") ?? ""));
  } catch (err) {
    letterError(applicationId, err instanceof Error ? err.message : "Saving failed.");
  }
  revalidatePath(`/app/applications/${applicationId}`);
}


/** A model that always fails: with no AI configured, Apply still opens the application and keeps the text. */
const NO_AI = { extractJd: async () => { throw new Error("AI is not set up"); } } as unknown as LlmProvider;

/** The model, logging every call, plus the CV builder Apply and the paste box share. */
async function applyDeps(w: NonNullable<Awaited<ReturnType<typeof getWorkspace>>>) {
  const { db, userId } = w;
  const day = today();
  const base = aiLlm(w, demoTaxonomy, await envFor(db, userId));
  const llm = base
    ? withLedger(base, async (e) => {
        await logTokens(db, userId, { date: day, module: e.module, model: e.model, tokensIn: e.tokensIn, tokensOut: e.tokensOut }).catch(() => undefined);
      })
    : NO_AI;
  const buildCv = async (applicationId: string) => {
    await tailorCv({ db, page: cvPageSettingsFromEnv((await envFor(db, userId))), select: cvSelectionSettingsFromEnv((await envFor(db, userId))) }, userId, applicationId, day);
  };
  return { db, llm, buildCv };
}


/** The paste box on an unread application: read the posting (or the kept text), then build the CV. */
export async function readPostingAction(applicationId: string, _prev: string | null, form: FormData): Promise<string | null> {
  const w = await ws();
  const r = await readPostingInto(await applyDeps(w), w.userId, applicationId, String(form.get("posting") ?? ""));
  if (!r.read) return r.error;
  revalidatePath("/app");
  revalidatePath(`/app/applications/${applicationId}`);
  redirect(`/app/applications/${applicationId}?applied=${r.cvError ? "no-cv" : "ready"}`);
}


/**
 * Open an application from a pasted JD (DESIGN.md section 2). Runs the same
 * tested processJd the API route does: extract ONCE via the routed small-tier
 * provider, merge the sector node, open a `saved` application - and log the
 * call to the token ledger. Returns an error string rather than throwing, so
 * the board can say what went wrong instead of showing a crash.
 */
export async function createFromJd(_prev: string | null, formData: FormData): Promise<string | null> {
  const w = await ws();
  const { db, userId } = w;
  const jd = String(formData.get("jd") ?? "").trim();
  if (jd.length < 40) return "Paste the full posting - that looks too short to parse.";
  if (jd.length > MAX_POSTING_CHARS) return new PostingTooLongError(jd.length).message;

  const base = aiLlm(w, demoTaxonomy, await envFor(db, userId));
  if (!base) return "No AI provider configured yet. Set AI_GATEWAY_API_KEY (Vercel AI Gateway, uses your included credit) or GEMINI_API_KEY / GROQ_API_KEY.";

  const day = today();
  const llm = withLedger(base, async (e) => {
    await logTokens(db, userId, {
      date: day,
      module: e.module,
      model: e.model,
      tokensIn: e.tokensIn,
      tokensOut: e.tokensOut,
    }).catch(() => undefined);
  });

  let applicationId: string;
  try {
    const result = await processJd({ db, llm }, userId, jd, day);
    applicationId = result.application.id;
  } catch (err) {
    return err instanceof Error ? err.message : "Could not read that posting.";
  }

  revalidatePath("/app");
  redirect(`/app/applications/${applicationId}`);
}


export interface SaveState {
  saved?: boolean;
  error?: string;
}

/**
 * Save the written answer to one bank question. Both drafts are saved every time - the
 * free-text one and the STAR one - so switching mode never discards anything.
 * Captured, never generated (DESIGN.md section 3): nothing here writes on your behalf.
 */
export async function saveAnswerAction(_prev: SaveState | null, formData: FormData): Promise<SaveState> {
  const { db, userId } = await ws();
  const questionId = String(formData.get("questionId") ?? "");
  if (!(await findQuestion(db, userId, questionId))) return { error: "Unknown question." };

  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const mode = field("mode") === "free" ? "free" : "star";
  try {
    await upsertAnswer(db, userId, {
      questionId,
      mode,
      body: field("body"),
      situation: field("situation"),
      task: field("task"),
      action: field("action"),
      result: field("result"),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save that answer." };
  }
  revalidatePath("/app/interview");
  return { saved: true };
}

export interface AddQuestionState {
  /** The new question's id (`custom:<id>`), for the page to open it. */
  id?: string;
  error?: string;
}

/**
 * Add a question of your own. It is stored as one bounded line (cleanQuestionText) and from
 * then on behaves like a bank question: same notes, same mock interview, same scoring.
 */
export async function addCustomQuestionAction(_prev: AddQuestionState | null, formData: FormData): Promise<AddQuestionState> {
  const { db, userId } = await ws();
  const maxChars = customQuestionMaxCharsFromEnv((await envFor(db, userId)));
  if (!maxChars) return { error: "Adding your own questions is switched off (INTERVIEW_CUSTOM_QUESTION_MAX_CHARS is not set)." };
  const cleaned = cleanQuestionText(String(formData.get("text") ?? ""), maxChars);
  if ("error" in cleaned) return { error: cleaned.error };
  try {
    const saved = await addCustomQuestion(db, userId, cleaned.text);
    revalidatePath("/app/interview");
    return { id: customQuestionId(saved.id) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save that question." };
  }
}

/** Remove one of your own questions. Its notes and attempts stay in the database. */
export async function removeCustomQuestionAction(questionId: string): Promise<{ error?: string }> {
  const { db, userId } = await ws();
  const storedId = storedIdOf(questionId);
  if (!storedId) return { error: "Only your own questions can be removed." };
  try {
    await removeCustomQuestion(db, userId, storedId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove that question." };
  }
  revalidatePath("/app/interview");
  return {};
}

/**
 * AI assist for a story draft - and note what it deliberately does NOT do.
 *
 * It returns the follow-up questions a real interviewer would ask about what the
 * user wrote. It does not write, extend or embellish the story: a fabricated
 * interview answer collapses on the first probe, which is exactly the moment it
 * matters (DESIGN.md section 3). Probing a draft adds no claim; writing one does.
 */
export interface ModelAnswerState {
  saved?: boolean;
  error?: string;
}

/** The draft in the answer editor, in the order it reads. */
function draftFromForm(formData: FormData): { text: string; substance: string } {
  const field = (k: string) => String(formData.get(k) ?? "").trim();
  if (field("mode") === "free") return { text: field("body"), substance: field("body") };
  const parts = (["situation", "task", "action", "result"] as const).map((k) => [k, field(k)] as const).filter(([, v]) => v);
  return { text: parts.map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v}`).join("\n"), substance: parts.map(([, v]) => v).join(" ") };
}

/**
 * Rewrite the user's written answer into a model answer (source "ai"). Saves the draft
 * first, so nothing typed is lost. One premium call (polish, token rule #5); the output
 * must state no number the draft does not contain (guardRewrite), or it is refused.
 * The user's written answer itself is never changed (DESIGN.md section 3).
 */
export async function rewriteModelAnswerAction(_prev: ModelAnswerState | null, formData: FormData): Promise<ModelAnswerState> {
  const w = await ws();
  const { db, userId } = w;
  const questionId = String(formData.get("questionId") ?? "");
  const found = await findQuestion(db, userId, questionId);
  if (!found) return { error: "Unknown question." };
  const draft = draftFromForm(formData);
  if (draft.substance.length < 80) return { error: "Write your answer first - the model answer is built from what you wrote." };

  const saved = await saveAnswerAction(null, formData);
  if (saved.error) return { error: saved.error };

  if (!aiReady(w)) return { error: "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example)." };
  const model = (await envFor(db, userId)).AI_GATEWAY_PREMIUM_MODEL ?? GATEWAY_PREMIUM_MODEL;
  const prompt = buildRewritePrompt({
    question: found.question.text,
    lookFor: found.question.lookFor,
    context: found.context,
    contextLabel: found.contextLabel,
    draft: draft.text,
  });
  let out = "";
  try {
    out = await aiWrite(w, "model-answer", { model, prompt, maxOutputTokens: 700 }, { draft: draft.text });
  } catch (err) {
    return { error: err instanceof Error ? `Could not rewrite: ${err.message}` : "Could not rewrite." };
  }
  await logTokens(db, userId, { date: today(), module: "interview-model-answer", model, tokensIn: 0, tokensOut: 0 }).catch(() => undefined);

  const check = guardRewrite(draft.text, out);
  if (!check.ok) {
    if (check.added.length) return { error: `The rewrite added ${check.added.join(", ")}, which your answer does not say. Nothing was saved - try again.` };
    return { error: check.empty ? "The rewrite came back empty. Try again." : "The rewrite came back too long. Try again." };
  }
  await setModelAnswer({ db }, userId, { questionId, text: check.text, source: "ai" }, new Date().toISOString());
  revalidatePath("/app/interview");
  return { saved: true };
}

/** Save the model answer as the user edited it (source "user"). */
export async function saveModelAnswerAction(_prev: ModelAnswerState | null, formData: FormData): Promise<ModelAnswerState> {
  const { db, userId } = await ws();
  const questionId = String(formData.get("questionId") ?? "");
  if (!(await findQuestion(db, userId, questionId))) return { error: "Unknown question." };
  try {
    await setModelAnswer({ db }, userId, { questionId, text: String(formData.get("modelAnswer") ?? ""), source: "user" }, new Date().toISOString());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save." };
  }
  revalidatePath("/app/interview");
  return { saved: true };
}

export interface ProbeState {
  questions?: string[];
  error?: string;
}

export async function probeStoryAction(_prev: ProbeState | null, formData: FormData): Promise<ProbeState> {
  const w = await ws();
  const { db, userId } = w;

  const field = (k: string) => String(formData.get(k) ?? "").trim();
  const free = field("mode") === "free";
  const draft = free
    ? [`Answer: ${field("body")}`]
    : [
        `Situation: ${field("situation")}`,
        `Task: ${field("task")}`,
        `Action: ${field("action")}`,
        `Result: ${field("result")}`,
      ];
  const substance = free ? field("body") : ["situation", "task", "action", "result"].map(field).join(" ");
  if (substance.trim().length < 40) {
    return { error: "Write a rough draft first - the questions come from what you wrote." };
  }

  if (!aiReady(w)) return { error: "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example)." };

  const question = field("question");
  const prompt = [
    "You are a consulting interviewer reading a candidate's draft answer to a behavioural question.",
    question ? `The question was: ${question}` : "",
    "Ask the 4 sharpest follow-up questions you would actually ask to test whether this is real and whether they personally did it.",
    "Probe for: what THEY did versus the team, what resisted them, what the number really measures, and what they would do differently.",
    "Do NOT rewrite or extend their answer. Do NOT invent detail. Output only the questions, one per line, no numbering.",
    "",
    ...draft,
  ]
    .filter((l, i) => l !== "" || i > 1)
    .join("\n");

  let text = "";
  try {
    text = await aiWrite(w, "probe", { model: (await envFor(db, userId)).AI_GATEWAY_SMALL_MODEL ?? GATEWAY_SMALL_MODEL, prompt, maxOutputTokens: 300 });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reach the model." };
  }

  // Usage is not itemised by the streaming endpoint here, so the ledger records the
  // call without token counts rather than inventing them.
  await logTokens(db, userId, {
    date: today(),
    module: "interview-probe",
    model: (await envFor(db, userId)).AI_GATEWAY_SMALL_MODEL ?? GATEWAY_SMALL_MODEL,
    tokensIn: 0,
    tokensOut: 0,
  }).catch(() => undefined);

  const questions = text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 8)
    .slice(0, 5);

  return questions.length ? { questions } : { error: "The model returned nothing usable. Try again." };
}

export interface ScoreResult {
  error?: string;
  overall?: number;
  scores?: Scores;
  strengths?: string[];
  improvements?: string[];
  signals?: DeliverySignals;
  saidNotWritten?: string[];
  model?: string;
}

// ---- case interviews ------------------------------------------------------------------------

export interface CaseTurnResult {
  error?: string;
  /** Set when the AI provider rate-limited us: seconds until the page should retry. */
  retryAfter?: number;
  sessionId?: string;
  session?: CaseSession;
}

/** Start a fresh attempt at a case. The opening prompt is from the sheet - no model call. */
export async function startCaseAction(caseId: string): Promise<CaseTurnResult> {
  const { db, userId } = await ws();
  const sheet = findCase(caseId);
  if (!sheet) return { error: "Unknown case." };
  const stored = await createCaseSession(db, userId, startSession(sheet, new Date().toISOString()));
  return { sessionId: stored.id, session: stored.session };
}

/**
 * One exchange with the interviewer. Code checks any math and decides what the model sees;
 * the model only phrases the reply and says whether this question is done. Saved every turn.
 */
export async function caseTurnAction(input: { sessionId: string; text: string }): Promise<CaseTurnResult> {
  const w = await ws();
  const { db, userId } = w;
  const stored = await getCaseSession(db, userId, input.sessionId);
  if (!stored) return { error: "That interview could not be found." };
  const sheet = findCase(stored.caseId);
  if (!sheet) return { error: "Unknown case." };
  const s = stored.session;
  if (s.status === "done") return { error: "This interview has finished." };
  const text = input.text.trim();
  if (!text) return { error: "Say or type something first." };

  if (!aiReady(w)) return { error: "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example)." };

  const q = currentQuestion(sheet, s);
  const check =
    q?.kind === "math" && q.answer ? { questionId: q.id, expected: q.answer.value, ...checkMath(q.answer, text) } : undefined;

  // Code guarantees progress (a correct answer or the turn cap closes the question); the model
  // then only acknowledges, so it cannot ask the next question over the top of the engine.
  const forced = forcedAdvance(sheet, s, check);

  // Conversation, not polish: the small tier keeps each turn quick (token rule #5).
  const model = (await envFor(db, userId)).AI_GATEWAY_CASE_MODEL || GATEWAY_SMALL_MODEL;
  let reply;
  try {
    const out = await aiWrite(
      w,
      "case-turn",
      { model, prompt: buildTurnPrompt(sheet, s, text, check, forced !== null), json: true, maxOutputTokens: 300 },
      { turn: s.turns.length },
    );
    reply = parseTurnReply(parseJsonLoose(out));
    if (forced) reply = { ...reply, advance: true };
    // Never let a line with an invented figure, or a repeated nudge, reach the candidate.
    const g = guardReply(sheet, s, text, reply);
    reply = { say: g.say, advance: g.advance };
  } catch (err) {
    const wait = retryAfterSeconds(err);
    if (wait !== null) return { error: `The interviewer is catching up - trying again in ${wait}s.`, retryAfter: wait };
    return { error: err instanceof Error ? `The interviewer lost the thread: ${err.message}` : "The interviewer lost the thread." };
  }

  const next = applyTurn(sheet, s, text, reply, new Date().toISOString(), check);
  await saveCaseSession(db, userId, stored.id, next);
  await logTokens(db, userId, { date: today(), module: "case-turn", model, tokensIn: 0, tokensOut: 0 }).catch(() => undefined);
  return { sessionId: stored.id, session: next };
}

/** Skip ahead when you are stuck - the next question is asked by code, no model call. */
export async function caseNextQuestionAction(sessionId: string): Promise<CaseTurnResult> {
  const { db, userId } = await ws();
  const stored = await getCaseSession(db, userId, sessionId);
  const sheet = stored && findCase(stored.caseId);
  if (!stored || !sheet) return { error: "That interview could not be found." };
  const next = advanceCase(sheet, stored.session, new Date().toISOString());
  await saveCaseSession(db, userId, stored.id, next);
  return { sessionId: stored.id, session: next };
}

export interface CaseDebriefResult {
  error?: string;
  overall?: number;
  scores?: CaseScores;
  strengths?: string[];
  improvements?: string[];
  perQuestion?: { questionId: string; note: string }[];
  signals?: CaseSignals;
  model?: string;
}

/** End the interview and score it. Judgement, so the premium tier (token rule #5). */
export async function finishCaseAction(sessionId: string): Promise<CaseDebriefResult> {
  const w = await ws();
  const { db, userId } = w;
  const stored = await getCaseSession(db, userId, sessionId);
  const sheet = stored && findCase(stored.caseId);
  if (!stored || !sheet) return { error: "That interview could not be found." };
  if (!stored.session.turns.some((t) => t.role === "candidate")) return { error: "Answer at least one question before asking for feedback." };

  if (!aiReady(w)) return { error: "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example)." };

  const signals = caseSignals(sheet, stored.session);
  const model = (await envFor(db, userId)).AI_GATEWAY_PREMIUM_MODEL ?? GATEWAY_PREMIUM_MODEL;
  let debrief;
  try {
    const out = await aiWrite(
      w,
      "case-debrief",
      { model, prompt: buildDebriefPrompt(sheet, stored.session, signals), json: true, maxOutputTokens: 900 },
      { questionIds: sheet.questions.map((q) => q.id) },
    );
    debrief = parseDebrief(parseJsonLoose(out));
  } catch (err) {
    return { error: err instanceof Error ? `Could not score the interview: ${err.message}` : "Could not score the interview." };
  }

  const overall = overallCaseScore(debrief.scores);
  await finishCaseSession(db, userId, stored.id, {
    session: { ...stored.session, status: "done" },
    scores: debrief.scores,
    overall,
    strengths: debrief.strengths,
    improvements: debrief.improvements,
    perQuestion: debrief.perQuestion,
    model,
  });
  await logTokens(db, userId, { date: today(), module: "case-debrief", model, tokensIn: 0, tokensOut: 0 }).catch(() => undefined);
  revalidatePath("/app/interview");
  return { overall, scores: debrief.scores, strengths: debrief.strengths, improvements: debrief.improvements, perQuestion: debrief.perQuestion, signals, model };
}

// ---- behavioural mock interview: follow-ups, then feedback -----------------------------------

export interface MockTurnResult {
  error?: string;
  retryAfter?: number;
  session?: MockSession;
}

/** The candidate's written answer for a question, so numbers said aloud can be checked against it. */
async function writtenAnswerFor(questionId: string): Promise<string> {
  const { db, userId } = await ws();
  const mine = (await listAnswers(db, userId)).find((a) => a.questionId === questionId);
  return mine ? [mine.body, mine.situation, mine.task, mine.action, mine.result].join(" ") : "";
}

/** Open a mock interview on one question. The question is asked from the bank - no model call. */
export async function startMockAction(input: { questionId: string; tone: Tone; maxFollowUps: number }): Promise<MockTurnResult> {
  const { db, userId } = await ws();
  const found = await findQuestion(db, userId, input.questionId);
  if (!found) return { error: "Unknown question." };
  const { question } = found;
  try {
    return { session: startMock(question, { tone: input.tone, maxFollowUps: input.maxFollowUps }, new Date().toISOString()) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start." };
  }
}

/**
 * One answer in, one follow-up out. Code finds the weaknesses and decides whether to probe
 * or close; the model only phrases the probe, and a line stating a number nobody said is
 * replaced. If the model fails, a safe stock follow-up keeps the interview moving. The
 * session lives in the page until feedback, when the whole conversation is saved.
 */
export async function mockTurnAction(input: { session: unknown; answer: string }): Promise<MockTurnResult> {
  const w = await ws();
  const { db, userId } = w;
  let s: MockSession;
  try {
    s = parseMockSession(input.session);
  } catch {
    return { error: "That interview could not be read. Start it again." };
  }
  if (s.status === "done") return { error: "This interview has finished." };
  const found = await findQuestion(db, userId, s.questionId);
  if (!found) return { error: "Unknown question." };
  const { question, context } = found;
  const answer = input.answer.trim();
  if (!answer) return { error: "Say or type something first." };

  const written = await writtenAnswerFor(question.id);
  const now = new Date().toISOString();
  const step = nextStep(s, answer, written);
  if (step.kind === "close") return { session: closeMock(s, answer, now) };

  if (!aiReady(w)) return { error: "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example)." };

  // The interviewer's judgement is the product: the same model as the full interview
  // (lib/interview/interviewer-model.ts), with premium as its fallback.
  const prompt = buildFollowUpPrompt({
    question: question.text,
    lookFor: question.lookFor,
    firmNote: context,
    interviewer: found.interviewer,
    contextLabel: found.contextLabel,
    session: s,
    latest: answer,
    candidates: step.candidates,
    questionFromCandidate: found.typed,
  });
  let reply = null;
  let model = "code";
  for (const m of interviewerModels((await envFor(db, userId)))) {
    try {
      const out = await aiWrite(
        w,
        "mock-turn",
        { model: m.model, prompt, json: true, maxOutputTokens: m.maxOutputTokens, reasoningEffort: m.reasoningEffort },
        { candidates: step.candidates },
      );
      reply = guardFollowUp(parseFollowUp(parseJsonLoose(out), step.candidates), s, answer);
      model = m.model;
      break;
    } catch (err) {
      const wait = retryAfterSeconds(err);
      if (wait !== null) return { error: `The interviewer is catching up - trying again in ${wait}s.`, retryAfter: wait };
      console.error(`[mock-turn] ${m.model} failed: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`);
    }
  }
  reply ??= { probe: step.candidates[0], say: FOLLOW_UP_FALLBACK[step.candidates[0]] };

  await logTokens(db, userId, { date: today(), module: "interview-follow-up", model, tokensIn: 0, tokensOut: 0 }).catch(() => undefined);
  return { session: applyFollowUp(s, answer, reply, now) };
}

export interface MockFeedbackResult extends ScoreResult {
  followUps?: FollowUpVerdict[];
  /** Measured in the page while you spoke; null for typed answers. */
  voice?: VoiceSummary | null;
  hedges?: Record<string, number>;
  /** Fillers counted on everything the candidate said. */
  fillers?: FillerReport;
  /** Against the question's model answer (role interviews), when it has one. */
  comparison?: ModelComparison | null;
  session?: MockSession;
}

/**
 * Close the interview (if it is still open) and score the whole conversation. Judgement, so
 * the premium tier (token rule #5). Saved as an attempt, so it joins the score history.
 */
export async function mockFeedbackAction(input: {
  session: unknown;
  answer?: string;
  /** Delivery numbers from the page - never audio. Validated; ignored if malformed. */
  voice?: unknown;
}): Promise<MockFeedbackResult> {
  const w = await ws();
  const { db, userId } = w;
  let s: MockSession;
  try {
    s = parseMockSession(input.session);
  } catch {
    return { error: "That interview could not be read. Start it again." };
  }
  const found = await findQuestion(db, userId, s.questionId);
  if (!found) return { error: "Unknown question." };
  const { question, context } = found;
  if (s.status === "running") s = closeMock(s, input.answer ?? null, new Date().toISOString());

  const said = s.turns.filter((t) => t.role === "candidate").map((t) => t.text).join(" ");
  if (!canScore(s)) {
    return { error: "There is not enough to give feedback on yet - answer the question first.", session: s };
  }

  if (!aiReady(w)) return { error: "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example).", session: s };

  // Length, pace and "I" vs "we" are judged on the main answer - follow-ups are short by design.
  const first = s.turns.find((t) => t.role === "candidate")?.text ?? "";
  const signals = deliverySignals(first, null);
  // Numbers said aloud are checked against the written answer and the model answer together.
  const { saidNotWritten } = numberDrift(said, [await writtenAnswerFor(question.id), found.modelAnswer ?? ""].join(" "));
  const fillers = fillerReport(said);
  const model = (await envFor(db, userId)).AI_GATEWAY_PREMIUM_MODEL ?? GATEWAY_PREMIUM_MODEL;
  const voice = parseVoiceSummary(input.voice);
  const hedges = hedgeCounts(said);
  const prompt = buildMockDebriefPrompt({
    question: question.text,
    lookFor: question.lookFor,
    firmNote: context,
    interviewer: found.interviewer,
    contextLabel: found.contextLabel,
    session: s,
    delivery: voicePromptLine(voice, hedges),
    questionFromCandidate: found.typed,
    modelAnswer: found.modelAnswer,
    fillers: fillerLine(fillers),
  });

  let debrief;
  try {
    const out = await aiWrite(
      w,
      "mock-feedback",
      { model, prompt, json: true, maxOutputTokens: 900 },
      {
        probes: s.turns.flatMap((t) => (t.probe ? [t.probe] : [])),
        hasModelAnswer: Boolean(found.modelAnswer),
        words: said.split(/\s+/).filter(Boolean).length,
      },
    );
    debrief = parseMockDebrief(parseJsonLoose(out), s);
  } catch (err) {
    return { error: err instanceof Error ? `Could not score that: ${err.message}` : "Could not score that.", session: s };
  }

  const overall = overallScore(debrief.scores);
  await saveAttempt(db, userId, {
    questionId: question.id,
    transcript: mockTranscript(s),
    durationSeconds: null,
    scores: debrief.scores,
    overall,
    strengths: debrief.strengths,
    improvements: debrief.improvements,
    model,
  });
  await logTokens(db, userId, { date: today(), module: "interview-mock-debrief", model, tokensIn: 0, tokensOut: 0 }).catch(() => undefined);
  revalidatePath("/app/interview");
  return {
    overall,
    scores: debrief.scores,
    strengths: debrief.strengths,
    improvements: debrief.improvements,
    followUps: debrief.followUps,
    comparison: debrief.comparison,
    fillers,
    voice,
    hedges,
    signals,
    saidNotWritten,
    model,
    session: s,
  };
}
