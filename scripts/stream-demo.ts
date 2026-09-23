/**
 * Streaming text generation through the Vercel AI Gateway.
 *
 *   npm run ai:stream
 *   npm run ai:stream -- "your prompt here"
 *
 * Reuses the project's existing AI client (plain fetch, lib/adapters) rather than adding
 * the `ai` SDK, so no new dependencies. Auth is AI_GATEWAY_API_KEY, loaded explicitly from
 * .env.local - a plain Node script does not read that file on its own.
 *
 * The key is never printed. Set AI_GATEWAY_MODEL to override the model; it must be a
 * `provider/model` id from https://ai-gateway.vercel.sh/v1/models.
 */
import { readFileSync } from "node:fs";
import { streamGatewayText } from "../lib/adapters/vercel-gateway-stream";
import { LlmHttpError } from "../lib/adapters/llm-http";

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trimStart().startsWith("#") && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* absent is fine */
  }
}

const apiKey = process.env.AI_GATEWAY_API_KEY;
if (!apiKey) {
  console.error(
    "AI_GATEWAY_API_KEY is not set.\n" +
      "Create one with:  npx vercel@latest --scope <team> ai-gateway api-keys create --name <name>\n" +
      "then add it to .env.local (gitignored). Never commit it.",
  );
  process.exit(1);
}

const model = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-6-astra";
const prompt =
  process.argv.slice(2).join(" ").trim() ||
  "In three sentences, explain why a job-search tool should refuse to put a claim on a CV that the candidate's own record cannot evidence.";

console.log(`model:  ${model}`);
console.log(`prompt: ${prompt}\n`);

let chars = 0;
const started = Date.now();
let firstDeltaAt: number | null = null;

try {
  for await (const delta of streamGatewayText({ apiKey, model, prompt })) {
    if (firstDeltaAt === null) firstDeltaAt = Date.now();
    chars += delta.length;
    process.stdout.write(delta);
  }
  const total = Date.now() - started;
  const ttfb = firstDeltaAt ? firstDeltaAt - started : total;
  console.log(`\n\n--- streamed ${chars} characters · first token ${ttfb}ms · total ${total}ms`);
} catch (err) {
  if (err instanceof LlmHttpError) {
    console.error(`\nGateway returned HTTP ${err.status}.`);
    if (err.status === 401) console.error("The key was rejected - check AI_GATEWAY_API_KEY.");
    // 403 is NOT an auth failure here. The gateway returns RestrictedModelsError when
    // the key is valid but the team's tier cannot reach that model - a different fix
    // entirely, and saying "check your key" sends you to the wrong place.
    if (err.status === 403) {
      console.error(
        `The key is valid but your tier cannot access "${model}".\n` +
          "Either add paid AI Gateway credits, or set AI_GATEWAY_MODEL to a model your tier allows.",
      );
    }
    if (err.status === 402) console.error("Out of AI Gateway credits, or the team needs a payment method.");
    if (err.status === 404) console.error(`Model "${model}" was not found - check /v1/models.`);
    process.exit(1);
  }
  throw err;
}
