/**
 * Play a scripted candidate through a case against the real interviewer, and print the
 * transcript and the debrief. A live check that the interviewer releases data only on
 * request, never gives the answer away, and moves the case along.
 *
 *   npm run case:drill -- <case-id>          (default: the first case)
 *
 * Reads AI_GATEWAY_API_KEY from .env.local, like `npm run ai:stream`. Nothing is saved.
 */
import { readFileSync } from "node:fs";
import raw from "../data/interview/cases.json";
import { parseCaseLibrary } from "../lib/interview/case-sheet";
import {
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
} from "../lib/interview/case-session";
import { streamGatewayText } from "../lib/adapters/vercel-gateway-stream";
import { parseJsonLoose } from "../lib/adapters/llm-http";
import { GATEWAY_PREMIUM_MODEL, GATEWAY_SMALL_MODEL } from "../lib/adapters/vercel-gateway";

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no file */
  }
}

const apiKey = process.env.AI_GATEWAY_API_KEY;
if (!apiKey) {
  console.error("AI_GATEWAY_API_KEY is not set.");
  process.exit(1);
}

const lib = parseCaseLibrary(raw);
const sheet = lib.cases.find((c) => c.id === process.argv[2]) ?? lib.cases[0];
const turnModel = process.env.AI_GATEWAY_CASE_MODEL || GATEWAY_SMALL_MODEL;

/** The gateway allows 5 requests a minute per model on this plan: space calls to stay under it. */
const lastCall = new Map<string, number>();
async function ask(model: string, prompt: string, max: number): Promise<unknown> {
  const wait = (lastCall.get(model) ?? 0) + 12_500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall.set(model, Date.now());
  let out = "";
  for await (const d of streamGatewayText({ apiKey: apiKey!, model, prompt, json: true, maxOutputTokens: max })) out += d;
  return parseJsonLoose(out);
}

/** The candidate's lines: a script, one list per question, with a fallback nudge. */
const script: string[] = (process.env.CASE_SCRIPT ?? "").split("||").map((s) => s.trim()).filter(Boolean);

let s = startSession(sheet, new Date().toISOString());
console.log(`\n=== ${sheet.title} (turns: ${turnModel}) ===\n\nINTERVIEWER: ${sheet.prompt}\n`);

/**
 * With no CASE_SCRIPT, a model plays the candidate and answers whatever the interviewer
 * actually asked - a realistic end-to-end run rather than a fixed script drifting out of step.
 */
async function simulatedCandidate(): Promise<string> {
  const transcript = s.turns
    .map((t) => (t.role === "exhibit" ? `[exhibit: ${JSON.stringify(sheet.questions.find((x) => x.id === t.questionId)?.exhibit)}]` : `${t.role}: ${t.text}`))
    .join("\n");
  const prompt = [
    "You are a strong MBA candidate in a Bain candidate-led case interview. Reply as the candidate to the interviewer's last line.",
    "Be concise (2-6 sentences). Ask for data when you need it. Do calculations explicitly and state the final number. Give a recommendation when asked.",
    "",
    transcript,
    "",
    'Reply with JSON only: {"say": "your line"}',
  ].join("\n");
  const r = (await ask(turnModel, prompt, 800)) as { say?: string };
  return String(r.say ?? "").trim() || "Could you repeat that?";
}

const lines: AsyncIterable<string> = {
  async *[Symbol.asyncIterator]() {
    if (script.length) yield* script;
    else for (let i = 0; i < 18 && s.status !== "done"; i++) yield await simulatedCandidate();
  },
};

for await (const line of lines) {
  if (s.status === "done") break;
  const q = currentQuestion(sheet, s)!;
  const check = q.kind === "math" && q.answer ? { questionId: q.id, expected: q.answer.value, ...checkMath(q.answer, line) } : undefined;
  const forced = forcedAdvance(sheet, s, check);
  const t0 = Date.now();
  let reply = parseTurnReply(await ask(turnModel, buildTurnPrompt(sheet, s, line, check, forced !== null), 300));
  if (forced) reply = { ...reply, advance: true };
  const g = guardReply(sheet, s, line, reply);
  if (g.guarded) console.log(`  (guard: replaced "${reply.say}" - ${g.guarded})`);
  reply = { say: g.say, advance: g.advance };
  const before = s.turns.length;
  s = applyTurn(sheet, s, line, reply, new Date().toISOString(), check);
  console.log(`YOU [${q.kind}]: ${line}`);
  if (check) console.log(`  (math check: heard ${check.heard}, ${check.correct ? "correct" : "not correct"})`);
  console.log(`INTERVIEWER (${Date.now() - t0} ms${reply.advance ? `, moves on${forced ? ` [code: ${forced}]` : ""}` : ""}): ${s.turns[before + 1].text}`);
  for (const t of s.turns.slice(before + 2)) console.log(t.role === "exhibit" ? `  [EXHIBIT: ${t.text}]` : `INTERVIEWER (next question): ${t.text}`);
  console.log("");
}

const signals = caseSignals(sheet, s);
const debrief = parseDebrief(await ask(GATEWAY_PREMIUM_MODEL, buildDebriefPrompt(sheet, s, signals), 900));
console.log("=== DEBRIEF ===");
console.log(JSON.stringify({ overall: overallCaseScore(debrief.scores), ...debrief, signals }, null, 2));
