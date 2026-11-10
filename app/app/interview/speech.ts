/**
 * Speech, shared by spoken practice and the case interviewer.
 * - Asking: when ElevenLabs is configured on the server, the interviewer's lines (text
 *   only) go to ElevenLabs via /api/tts and come back as audio; otherwise the browser
 *   speaks them with the voices installed with the OS or browser.
 * - Answering: the browser's speech recognition transcribes. JobSearch's own server only
 *   ever receives text. Note what the browser does, though: Chrome's and Edge's
 *   recognition stream the microphone audio to Google's / Microsoft's speech services.
 *   Your voice never goes to ElevenLabs.
 */

// Minimal typings - the Web Speech API is not in TypeScript's DOM lib yet.
export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
export type RecognitionCtor = new () => SpeechRecognitionLike;

export function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Accent choices are data about the speaker, never assumed (rule 4). */
export const LANGS = [
  { id: "en-US", label: "English (US)" },
  { id: "en-GB", label: "English (UK)" },
  { id: "en-IN", label: "English (India)" },
  { id: "en-SG", label: "English (Singapore)" },
  { id: "en-AU", label: "English (Australia)" },
];

// The interviewer's voice: ElevenLabs through /api/tts when the server has it configured,
// otherwise the browser's own voice. A 501 means "not configured" - remembered for the
// page's life so we stop asking. Any other failure falls back for that line only.
let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let serverVoice: boolean | null = null;
let generation = 0;

/** Stop whatever is being said, by either voice. */
export function stopSpeaking(): void {
  generation++;
  if (current) {
    current.pause();
    current = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

function browserSpeak(text: string, lang: string, rate: number): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  window.speechSynthesis.speak(u);
}

/** Read text aloud, cancelling anything already being spoken. */
export async function speak(text: string, lang: string, rate = 0.97): Promise<void> {
  if (typeof window === "undefined") return;
  stopSpeaking();
  const mine = generation;
  if (serverVoice !== false) {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.status === 501) serverVoice = false;
      if (res.ok) {
        serverVoice = true;
        const blob = await res.blob();
        if (mine !== generation) return; // stopped or replaced while loading
        currentUrl = URL.createObjectURL(blob);
        current = new Audio(currentUrl);
        current.onended = () => {
          if (mine === generation) stopSpeaking();
        };
        await current.play();
        return;
      }
    } catch {
      /* network or autoplay failure - use the browser voice */
    }
  }
  if (mine !== generation) return;
  browserSpeak(text, lang, rate);
}
