import { describe, expect, it } from "vitest";
import { ttsConfigFromEnv, ttsLedgerEntry, ttsRequest, type TtsConfig } from "./elevenlabs";

const env = {
  ELEVENLABS_API_KEY: "xi-test-key",
  ELEVENLABS_VOICE_ID: "voice123",
  ELEVENLABS_MODEL_ID: "eleven_flash_v2_5",
  ELEVENLABS_OUTPUT_FORMAT: "mp3_44100_128",
  ELEVENLABS_MAX_CHARS: "500",
};

const cfg: TtsConfig = {
  apiKey: "xi-test-key",
  voiceId: "voice123",
  modelId: "eleven_flash_v2_5",
  outputFormat: "mp3_44100_128",
  maxChars: 500,
};

describe("ttsConfigFromEnv", () => {
  it("reads every setting from env", () => {
    expect(ttsConfigFromEnv(env)).toEqual(cfg);
  });

  it("is null when any setting is missing, so the browser voice is used", () => {
    for (const key of Object.keys(env)) {
      expect(ttsConfigFromEnv({ ...env, [key]: undefined })).toBeNull();
      expect(ttsConfigFromEnv({ ...env, [key]: "  " })).toBeNull();
    }
  });

  it("is null when the character cap is not a positive whole number", () => {
    for (const bad of ["0", "-5", "abc", "12.5"]) {
      expect(ttsConfigFromEnv({ ...env, ELEVENLABS_MAX_CHARS: bad })).toBeNull();
    }
  });
});

describe("ttsRequest", () => {
  it("posts the text to the voice's streaming endpoint", () => {
    const r = ttsRequest("Walk me through your structure.", cfg);
    expect(r.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice123/stream?output_format=mp3_44100_128");
    expect(r.init.method).toBe("POST");
    expect(JSON.parse(String(r.init.body))).toEqual({ text: "Walk me through your structure.", model_id: "eleven_flash_v2_5" });
  });

  it("sends the key in a header, never in the URL", () => {
    const r = ttsRequest("Hello.", cfg);
    expect((r.init.headers as Record<string, string>)["xi-api-key"]).toBe("xi-test-key");
    expect(r.url).not.toContain("xi-test-key");
  });

  it("encodes the voice id in the path", () => {
    const r = ttsRequest("Hello.", { ...cfg, voiceId: "a/b?c" });
    expect(r.url).toContain("/text-to-speech/a%2Fb%3Fc/stream");
  });

  it("trims the text and rejects empty text", () => {
    expect(JSON.parse(String(ttsRequest("  Hi.  ", cfg).init.body)).text).toBe("Hi.");
    expect(() => ttsRequest("   ", cfg)).toThrow(/empty/);
  });

  it("rejects text over the character cap", () => {
    expect(() => ttsRequest("x".repeat(501), cfg)).toThrow(/too long/);
    expect(() => ttsRequest("x".repeat(500), cfg)).not.toThrow();
  });
});

describe("ttsLedgerEntry", () => {
  it("logs characters spoken against the tts module and the voice model", () => {
    expect(ttsLedgerEntry("  Hello there.  ", cfg)).toEqual({
      module: "interview-tts",
      model: "elevenlabs/eleven_flash_v2_5",
      tokensIn: 12,
      tokensOut: 0,
    });
  });
});
