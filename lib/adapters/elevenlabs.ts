/**
 * ElevenLabs text-to-speech: the interviewer's voice in spoken practice and the case room.
 * Pure - builds the request, the route sends it. Opt-in (rule 5): with any setting missing,
 * `ttsConfigFromEnv` returns null and the client keeps the browser's own voice. Every
 * setting comes from env; nothing defaults in code. The key stays server-side.
 */

export interface TtsConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  /** Longest text one request may send - a guard on credit spend. */
  maxChars: number;
}

export interface TtsRequest {
  url: string;
  init: RequestInit;
}

const API = "https://api.elevenlabs.io/v1/text-to-speech";

/** token_ledger.module for spoken interviewer lines. */
export const TTS_LEDGER_MODULE = "interview-tts";

export function ttsConfigFromEnv(env: Record<string, string | undefined>): TtsConfig | null {
  const get = (k: string) => env[k]?.trim() || null;
  const apiKey = get("ELEVENLABS_API_KEY");
  const voiceId = get("ELEVENLABS_VOICE_ID");
  const modelId = get("ELEVENLABS_MODEL_ID");
  const outputFormat = get("ELEVENLABS_OUTPUT_FORMAT");
  const max = get("ELEVENLABS_MAX_CHARS");
  if (!apiKey || !voiceId || !modelId || !outputFormat || !max) return null;
  if (!/^\d+$/.test(max) || Number(max) <= 0) return null;
  return { apiKey, voiceId, modelId, outputFormat, maxChars: Number(max) };
}

export function ttsRequest(text: string, cfg: TtsConfig): TtsRequest {
  const t = text.trim();
  if (!t) throw new Error("empty text");
  if (t.length > cfg.maxChars) throw new Error(`text too long (${t.length} > ${cfg.maxChars} characters)`);
  return {
    url: `${API}/${encodeURIComponent(cfg.voiceId)}/stream?output_format=${encodeURIComponent(cfg.outputFormat)}`,
    init: {
      method: "POST",
      headers: { "xi-api-key": cfg.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: t, model_id: cfg.modelId }),
    },
  };
}

/** Ledger row for one spoken line: ElevenLabs bills by character, so characters go in tokensIn. */
export function ttsLedgerEntry(text: string, cfg: TtsConfig) {
  return { module: TTS_LEDGER_MODULE, model: `elevenlabs/${cfg.modelId}`, tokensIn: text.trim().length, tokensOut: 0 };
}
