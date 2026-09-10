import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/db";
import { createLlm, withLedger } from "@/lib/adapters/llm-factory";
import { logTokens } from "@/lib/repos/token-ledger";
import { processJd } from "@/lib/services/process-jd";

/**
 * POST /api/jd  { jd: string }
 * JD intake: parse ONCE via the routed LlmProvider (small tier), merge the
 * sector node, open a `saved` application. Every call is logged to the token
 * ledger. 503 when no LLM key is configured - the extract cannot be faked.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const w = await getWorkspace();
  if (!w) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { jd?: unknown } | null;
  const jd = typeof body?.jd === "string" ? body.jd.trim() : "";
  if (jd.length < 40) return NextResponse.json({ error: "Send { jd: string } with the full posting." }, { status: 400 });

  const base = createLlm(process.env);
  if (!base) {
    return NextResponse.json(
      { error: "No LLM configured. Set GEMINI_API_KEY or GROQ_API_KEY (free tiers) - see .env.example." },
      { status: 503 },
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const llm = withLedger(base, async (e) => {
    await logTokens(w.db, w.userId, { date: today, module: e.module, model: e.model, tokensIn: e.tokensIn, tokensOut: e.tokensOut }).catch(
      () => undefined,
    );
  });

  try {
    const result = await processJd({ db: w.db, llm }, w.userId, jd, today);
    return NextResponse.json({ application: result.application, sector: result.sector }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "processJd failed" }, { status: 502 });
  }
}
