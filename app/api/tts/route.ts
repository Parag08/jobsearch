import { getWorkspace } from "@/lib/db";
import { ttsConfigFromEnv, ttsLedgerEntry, ttsRequest } from "@/lib/adapters/elevenlabs";
import { logTokens } from "@/lib/repos/token-ledger";

/**
 * POST /api/tts  { text: string }  ->  audio/mpeg
 * The interviewer's voice, via ElevenLabs. The key never leaves the server. 501 when
 * ElevenLabs is not configured - the client then uses the browser's voice. Signed-in
 * only, so nobody else spends the credits. Characters spoken go to the token ledger.
 */
export async function POST(req: Request): Promise<Response> {
  const cfg = ttsConfigFromEnv(process.env);
  if (!cfg) return new Response(null, { status: 501 });

  const w = await getWorkspace();
  if (!w) return Response.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text : "";
  let r;
  try {
    r = ttsRequest(text, cfg);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "bad text" }, { status: 400 });
  }

  const upstream = await fetch(r.url, r.init).catch(() => null);
  if (!upstream?.ok || !upstream.body) {
    return Response.json({ error: `ElevenLabs answered ${upstream?.status ?? "nothing"}` }, { status: 502 });
  }

  const today = new Date().toISOString().slice(0, 10);
  await logTokens(w.db, w.userId, { date: today, ...ttsLedgerEntry(text, cfg) }).catch(() => undefined);

  return new Response(upstream.body, {
    headers: { "content-type": upstream.headers.get("content-type") ?? "audio/mpeg", "cache-control": "no-store" },
  });
}
