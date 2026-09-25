"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { advance } from "@/lib/pipeline";
import { STAGES, type ClosedReason, type Stage } from "@/lib/types";
import { getApplication, updateApplication } from "@/lib/repos/applications";
import { markApplied } from "@/lib/services/mark-applied";
import { tailorCv } from "@/lib/services/tailor-cv";
import { refreshWatchlist } from "@/lib/services/refresh-watchlist";
import { addWatchlistEntry, removeWatchlistEntry, setWatchlistActive } from "@/lib/repos/watchlist";
import { newWatchlistEntry } from "@/lib/watchlist/types";
import { HttpBoardFetcher } from "@/lib/watchlist/fetcher";
import { parseTargetList } from "@/lib/watchlist/targets";
import { getProfile, saveProfile } from "@/lib/repos/profiles";
import { setSourcedJobStatus } from "@/lib/repos/sourced-jobs";
import { listCompanies, watchableCompanies } from "@/lib/repos/companies";
import { listAnswers, saveAttempt, upsertAnswer } from "@/lib/repos/answers";
import { buildScoringPrompt, deliverySignals, numberDrift, overallScore, parseScore, type DeliverySignals, type Scores } from "@/lib/interview/score";
import { firmNote } from "@/lib/interview/questions";
import { parseJsonLoose, retryAfterSeconds } from "@/lib/adapters/llm-http";
import { questionBank } from "./interview/bank";
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
import { streamGatewayText } from "@/lib/adapters/vercel-gateway-stream";
import { GATEWAY_PREMIUM_MODEL, GATEWAY_SMALL_MODEL } from "@/lib/adapters/vercel-gateway";
import { createLlm, withLedger } from "@/lib/adapters/llm-factory";
import { logTokens } from "@/lib/repos/token-ledger";
import { processJd } from "@/lib/services/process-jd";

async function ws() {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  return w;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Move an application; the applied transition goes through markApplied so the sent CV freezes. */
export async function moveStage(applicationId: string, to: Stage, closedReason?: ClosedReason): Promise<void> {
  const { db, userId } = await ws();
  if (!STAGES.includes(to)) return;
  if (to === "applied") {
    await markApplied({ db }, userId, applicationId, new Date().toISOString());
  } else {
    const app = await getApplication(db, userId, applicationId);
    if (!app) return;
    await updateApplication(db, userId, advance(app, to, today(), closedReason));
  }
  revalidatePath("/app");
  revalidatePath(`/app/applications/${applicationId}`);
}

export async function setNextAction(applicationId: string, formData: FormData): Promise<void> {
  const { db, userId } = await ws();
  const app = await getApplication(db, userId, applicationId);
  if (!app) return;
  const nextAction = String(formData.get("nextAction") ?? "").trim();
  await updateApplication(db, userId, { ...app, nextAction: nextAction || null, updatedAt: today() });
  revalidatePath("/app");
  revalidatePath(`/app/applications/${applicationId}`);
}

export async function tailorCvAction(applicationId: string): Promise<void> {
  const { db, userId } = await ws();
  await tailorCv({ db }, userId, applicationId, today());
  revalidatePath(`/app/applications/${applicationId}`);
}

export async function addWatchlist(formData: FormData): Promise<void> {
  const { db, userId } = await ws();
  const company = String(formData.get("company") ?? "").trim();
  const careersUrl = String(formData.get("careersUrl") ?? "").trim();
  if (!company || !careersUrl) return;
  await addWatchlistEntry(db, userId, newWatchlistEntry(company, careersUrl, today()));
  revalidatePath("/app/watchlist");
}

export async function toggleWatchlist(id: string, active: boolean): Promise<void> {
  const { db, userId } = await ws();
  await setWatchlistActive(db, userId, id, active);
  revalidatePath("/app/watchlist");
}

export async function removeWatchlist(id: string): Promise<void> {
  const { db, userId } = await ws();
  await removeWatchlistEntry(db, userId, id);
  revalidatePath("/app/watchlist");
}

export async function refreshWatchlistAction(): Promise<void> {
  const { db, userId } = await ws();
  await refreshWatchlist({ db, fetcher: new HttpBoardFetcher(fetch) }, userId, today());
  revalidatePath("/app/watchlist");
}

/** What the watchlist keeps: cities, title phrases, excluded phrases (lib/watchlist/targets.ts). */
export async function saveJobTargets(form: FormData): Promise<void> {
  const { db, userId } = await ws();
  const profile = await getProfile(db, userId);
  if (!profile) return;
  const list = (name: string) => parseTargetList(String(form.get(name) ?? ""));
  await saveProfile(db, {
    ...profile,
    targetGeos: list("geos"),
    targetTitles: list("titles"),
    excludedTitles: list("excluded"),
  });
  revalidatePath("/app/watchlist");
}

export async function setJobStatus(id: string, status: "shortlisted" | "dismissed" | "tracked"): Promise<void> {
  const { db, userId } = await ws();
  await setSourcedJobStatus(db, userId, id, status);
  revalidatePath("/app/watchlist");
}

/**
 * Open an application from a pasted JD (DESIGN.md section 2). Runs the same
 * tested processJd the API route does: extract ONCE via the routed small-tier
 * provider, merge the sector node, open a `saved` application - and log the
 * call to the token ledger. Returns an error string rather than throwing, so
 * the board can say what went wrong instead of showing a crash.
 */
export async function createFromJd(_prev: string | null, formData: FormData): Promise<string | null> {
  const { db, userId } = await ws();
  const jd = String(formData.get("jd") ?? "").trim();
  if (jd.length < 40) return "Paste the full posting - that looks too short to parse.";

  const base = createLlm(process.env);
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

/**
 * Watch a company from the central directory (DESIGN.md section 4).
 *
 * Carries the directory's VERIFIED ats and token across rather than re-deriving
 * them from the careers URL: probing checked them against the live board, and most
 * verified boards sit behind a vanity domain that detectAts would call "unknown"
 * (grab.careers is a SmartRecruiters board; nothing in the URL says so).
 */
export async function watchCompany(companyId: string): Promise<void> {
  const { db, userId } = await ws();
  const directory = await listCompanies(db);
  const c = directory.find((x) => x.id === companyId);
  if (!c) return;

  await addWatchlistEntry(db, userId, {
    company: c.name,
    careersUrl: c.careersUrl,
    ats: c.ats,
    token: c.token,
    active: true,
    addedAt: today(),
  });
  revalidatePath("/app/watchlist");
}

/** Watch every directory company whose board can actually be read today. */
export async function watchAllReadable(): Promise<void> {
  const { db, userId } = await ws();
  const readable = await watchableCompanies(db);
  for (const c of readable) {
    await addWatchlistEntry(db, userId, {
      company: c.name,
      careersUrl: c.careersUrl,
      ats: c.ats,
      token: c.token,
      active: true,
      addedAt: today(),
    });
  }
  revalidatePath("/app/watchlist");
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
  if (!questionBank.questions.some((q) => q.id === questionId)) return { error: "Unknown question." };

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

/**
 * AI assist for a story draft - and note what it deliberately does NOT do.
 *
 * It returns the follow-up questions a real interviewer would ask about what the
 * user wrote. It does not write, extend or embellish the story: a fabricated
 * interview answer collapses on the first probe, which is exactly the moment it
 * matters (DESIGN.md section 3). Probing a draft adds no claim; writing one does.
 */
export interface ProbeState {
  questions?: string[];
  error?: string;
}

export async function probeStoryAction(_prev: ProbeState | null, formData: FormData): Promise<ProbeState> {
  const { db, userId } = await ws();

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

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return { error: "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example)." };

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
    for await (const delta of streamGatewayText({
      apiKey,
      model: process.env.AI_GATEWAY_SMALL_MODEL ?? GATEWAY_SMALL_MODEL,
      prompt,
      maxOutputTokens: 300,
    })) {
      text += delta;
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reach the model." };
  }

  // Usage is not itemised by the streaming endpoint here, so the ledger records the
  // call without token counts rather than inventing them.
  await logTokens(db, userId, {
    date: today(),
    module: "interview-probe",
    model: process.env.AI_GATEWAY_SMALL_MODEL ?? GATEWAY_SMALL_MODEL,
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

/**
 * Score a spoken practice answer. The browser transcribes; this scores.
 *
 * What can be measured is measured deterministically first (lib/interview/score.ts):
 * length, pace, "I" versus "we", and numbers said aloud that the written answer does not
 * contain. Only the judgement - structure, specificity, reflection - goes to the model,
 * whose output is validated and clamped rather than trusted. The attempt is saved, so the
 * score history becomes the progress record.
 */
export async function scoreAnswerAction(input: {
  questionId: string;
  transcript: string;
  durationSeconds: number | null;
  firm: string;
}): Promise<ScoreResult> {
  const { db, userId } = await ws();
  const question = questionBank.questions.find((q) => q.id === input.questionId);
  if (!question) return { error: "Unknown question." };

  const transcript = input.transcript.trim();
  if (transcript.split(/\s+/).length < 20) {
    return { error: "That is too short to score - give it at least a full sentence or three." };
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return { error: "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example)." };

  const signals = deliverySignals(transcript, input.durationSeconds);
  const answers = await listAnswers(db, userId);
  const mine = answers.find((a) => a.questionId === question.id);
  const written = mine ? [mine.body, mine.situation, mine.task, mine.action, mine.result].join(" ") : "";
  const { saidNotWritten } = numberDrift(transcript, written);

  // Judgement, not extraction - so the premium tier (token rule #5).
  const model = process.env.AI_GATEWAY_PREMIUM_MODEL ?? GATEWAY_PREMIUM_MODEL;
  const prompt = buildScoringPrompt({
    question: question.text,
    lookFor: question.lookFor,
    firmNote: firmNote(question, input.firm),
    transcript,
  });

  let text = "";
  let parsed;
  try {
    for await (const d of streamGatewayText({ apiKey, model, prompt, json: true, maxOutputTokens: 600 })) text += d;
    parsed = parseScore(parseJsonLoose(text));
  } catch (err) {
    return { error: err instanceof Error ? `Could not score that: ${err.message}` : "Could not score that." };
  }

  const overall = overallScore(parsed.scores);
  await saveAttempt(db, userId, {
    questionId: question.id,
    transcript,
    durationSeconds: signals.durationSeconds,
    scores: parsed.scores,
    overall,
    strengths: parsed.strengths,
    improvements: parsed.improvements,
    model,
  });
  await logTokens(db, userId, { date: today(), module: "interview-score", model, tokensIn: 0, tokensOut: 0 }).catch(
    () => undefined,
  );

  revalidatePath("/app/interview");
  return { overall, scores: parsed.scores, strengths: parsed.strengths, improvements: parsed.improvements, signals, saidNotWritten, model };
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
  const { db, userId } = await ws();
  const stored = await getCaseSession(db, userId, input.sessionId);
  if (!stored) return { error: "That interview could not be found." };
  const sheet = findCase(stored.caseId);
  if (!sheet) return { error: "Unknown case." };
  const s = stored.session;
  if (s.status === "done") return { error: "This interview has finished." };
  const text = input.text.trim();
  if (!text) return { error: "Say or type something first." };

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return { error: "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example)." };

  const q = currentQuestion(sheet, s);
  const check =
    q?.kind === "math" && q.answer ? { questionId: q.id, expected: q.answer.value, ...checkMath(q.answer, text) } : undefined;

  // Code guarantees progress (a correct answer or the turn cap closes the question); the model
  // then only acknowledges, so it cannot ask the next question over the top of the engine.
  const forced = forcedAdvance(sheet, s, check);

  // Conversation, not polish: the small tier keeps each turn quick (token rule #5).
  const model = process.env.AI_GATEWAY_CASE_MODEL || GATEWAY_SMALL_MODEL;
  let reply;
  try {
    let out = "";
    for await (const d of streamGatewayText({ apiKey, model, prompt: buildTurnPrompt(sheet, s, text, check, forced !== null), json: true, maxOutputTokens: 300 })) {
      out += d;
    }
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
  const { db, userId } = await ws();
  const stored = await getCaseSession(db, userId, sessionId);
  const sheet = stored && findCase(stored.caseId);
  if (!stored || !sheet) return { error: "That interview could not be found." };
  if (!stored.session.turns.some((t) => t.role === "candidate")) return { error: "Answer at least one question before asking for feedback." };

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return { error: "No AI provider configured. Set AI_GATEWAY_API_KEY (see .env.example)." };

  const signals = caseSignals(sheet, stored.session);
  const model = process.env.AI_GATEWAY_PREMIUM_MODEL ?? GATEWAY_PREMIUM_MODEL;
  let debrief;
  try {
    let out = "";
    for await (const d of streamGatewayText({ apiKey, model, prompt: buildDebriefPrompt(sheet, stored.session, signals), json: true, maxOutputTokens: 900 })) {
      out += d;
    }
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
