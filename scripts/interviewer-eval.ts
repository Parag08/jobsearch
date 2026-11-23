/**
 * The interviewer eval (docs/FULL-INTERVIEW.md, "Measuring the interviewer").
 *
 * Input: your eval set, downloaded from the full interview's transcript ("Download the eval
 * set", GET /api/interview-eval): one case per interviewer decision in your finished
 * interviews, with your good/bad ratings.
 *
 *   npm run interview:eval -- <set.json>                 score what the interviewer said then (free)
 *   npm run interview:eval -- <set.json> --live          replay every case through today's interviewer and score that
 *   npm run interview:eval -- <set.json> --live --judge  also have a judge model grade each line 1-5
 *   options: --limit N (first N cases), --out <file> (default: <set>.<mode>.results.json)
 *
 * --live uses the interviewer settings in .env / .env.local (AI_GATEWAY_INTERVIEWER_MODEL,
 * _EFFORT, _MAX_TOKENS, AI_GATEWAY_PREMIUM_MODEL) - set them there to compare models; your
 * Settings page values are not read. --judge needs EVAL_JUDGE_MODEL (and, for a thinking
 * model, EVAL_JUDGE_EFFORT + EVAL_JUDGE_MAX_TOKENS). Both need AI_GATEWAY_API_KEY and are billed
 * to the gateway: one interviewer call per case (fewer: no call when only one move is legal)
 * and one judge call per case. Nothing is written to the database.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { streamGatewayText } from "../lib/adapters/vercel-gateway-stream";
import { parseJsonLoose, retryAfterSeconds } from "../lib/adapters/llm-http";
import { composeLine, legalMoves } from "../lib/interview/full-session";
import { chooseFullReply } from "../lib/interview/full-turn";
import { interviewerModels } from "../lib/interview/interviewer-model";
import { buildJudgePrompt, parseEvalSet, parseJudge, scoreLine, summarize, type EvalCase, type LineScore } from "../lib/interview/eval";

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

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const input = args.find((a, i) => !a.startsWith("--") && !["--limit", "--out"].includes(args[i - 1] ?? ""));
if (!input) {
  console.error("Usage: npm run interview:eval -- <eval-set.json> [--live] [--judge] [--limit N] [--out file]");
  process.exit(1);
}
const live = flag("--live");
const judge = flag("--judge");
const limit = option("--limit") ? Number(option("--limit")) : undefined;
if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
  console.error("--limit must be a whole number of at least 1.");
  process.exit(1);
}

const apiKey = process.env.AI_GATEWAY_API_KEY;
const judgeModel = process.env.EVAL_JUDGE_MODEL?.trim();
if ((live || judge) && !apiKey) {
  console.error("--live and --judge call the AI Gateway: set AI_GATEWAY_API_KEY in .env.local.");
  process.exit(1);
}
if (judge && !judgeModel) {
  console.error("--judge needs EVAL_JUDGE_MODEL (a strong model, e.g. one from the Settings page's list) in .env.local.");
  process.exit(1);
}
const JUDGE_TOKENS = 300;
const judgeEffort = process.env.EVAL_JUDGE_EFFORT?.trim() || undefined;
const judgeCap = process.env.EVAL_JUDGE_MAX_TOKENS ? Number(process.env.EVAL_JUDGE_MAX_TOKENS) : JUDGE_TOKENS;
if (judgeEffort && !process.env.EVAL_JUDGE_MAX_TOKENS) {
  console.error("EVAL_JUDGE_EFFORT needs EVAL_JUDGE_MAX_TOKENS: the cap must cover the thinking too.");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One gateway call; a rate limit waits as long as the gateway asks, up to three times. */
async function ask(model: string, prompt: string, maxOutputTokens: number, reasoningEffort?: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      let out = "";
      for await (const d of streamGatewayText({ apiKey: apiKey!, model, prompt, json: true, maxOutputTokens, reasoningEffort })) out += d;
      return out;
    } catch (err) {
      const wait = retryAfterSeconds(err);
      if (wait === null || attempt >= 3) throw err;
      console.error(`  rate limited on ${model}; waiting ${wait}s`);
      await sleep(wait * 1000);
    }
  }
}

const set = parseEvalSet(JSON.parse(readFileSync(input, "utf8")));
const cases: EvalCase[] = set.cases.slice(0, limit);
const models = interviewerModels(process.env);
const mode = live ? "live" : "recorded";
console.log(`\n${cases.length} cases from ${basename(input)} (exported ${set.exportedAt.slice(0, 10)}).`);
console.log(live ? `Replaying through: ${models.map((m) => `${m.model}${m.reasoningEffort ? ` (${m.reasoningEffort})` : ""}`).join(", then ")}` : "Scoring what the interviewer said at the time.");
if (judge) console.log(`Judge: ${judgeModel}`);
console.log("");

const scores: (LineScore & { said?: string; answeredBy?: string; recorded: string; rating?: string; better?: string | null })[] = [];
for (const [n, c] of cases.entries()) {
  let move = c.recorded.move;
  let line = c.recorded.say;
  let said: string | undefined;
  let answeredBy: string | undefined;
  if (live) {
    const legal = legalMoves(c.session, c.latest, c.written);
    const choice = await chooseFullReply(
      { session: c.session, latest: c.latest, legal },
      models,
      (m, prompt) => ask(m.model, prompt, m.maxOutputTokens, m.reasoningEffort),
      (model, err) => console.error(`  ${model} failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`),
    );
    answeredBy = choice.model;
    // Score the model's own line, before the guards repaired it: the guards hide problems.
    const picked = choice.raw ?? choice.reply;
    move = picked.move;
    line = composeLine(picked, c.session.plan);
    said = composeLine(choice.reply, c.session.plan);
  }
  const score: (typeof scores)[number] = { ...scoreLine(c, move, line), recorded: c.recorded.say, rating: c.rating, better: c.better, said, answeredBy };
  if (judge) {
    try {
      score.judge = parseJudge(parseJsonLoose(await ask(judgeModel!, buildJudgePrompt(c, line), judgeCap, judgeEffort)));
    } catch (err) {
      console.error(`  judge failed on ${c.id}: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
    }
  }
  scores.push(score);
  const mark = score.problems.length ? `✗ ${score.problems.join(", ")}` : "✓";
  const rated = c.rating ? ` [you: ${c.rating}]` : "";
  console.log(`${String(n + 1).padStart(3)}. ${mark}${score.judge ? ` · judge ${score.judge.score}/5` : ""}${rated}`);
  console.log(`     ${move}: ${line}`);
  if (live && said && said !== line) console.log(`     (said after guards: ${said})`);
}

const summary = summarize(scores, cases);
const pct = (k: number) => (summary.cases ? `${Math.round((k / summary.cases) * 100)}%` : "-");
console.log(`\n=== ${mode} ===`);
console.log(`clean lines        ${summary.clean}/${summary.cases} (${pct(summary.clean)})`);
for (const [p, k] of Object.entries(summary.problems)) console.log(`${p.padEnd(18)} ${k}`);
console.log(`moves              ${Object.entries(summary.moves).map(([m, k]) => `${m} ${k}`).join(", ")}`);
if (summary.ratedBad) console.log(`your bad lines     said again ${summary.badRepeated} of ${summary.ratedBad}`);
if (summary.judge) console.log(`judge              ${summary.judge.average}/5 over ${summary.judge.scored} lines`);

const out = option("--out") ?? join(dirname(input), `${basename(input, ".json")}.${mode}.results.json`);
writeFileSync(out, JSON.stringify({ mode, models: live ? models : null, judge: judge ? judgeModel : null, ranAt: new Date().toISOString(), summary, scores }, null, 1));
console.log(`\nResults: ${out}`);
