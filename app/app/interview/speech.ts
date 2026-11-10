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
/** Resolves the promise of whatever is being said now - called on end, error or stop. */
let settle: (() => void) | null = null;

// ---- what the interviewer is doing right now, for the avatar and the captions ----------
// ElevenLabs audio is routed through an AnalyserNode so the avatar can move with the
// voice. The browser voice cannot be measured, so its word-boundary events stand in.
let ctx: AudioContext | null = null;
let voiceAnalyser: AnalyserNode | null = null;
let speakingText: string | null = null;
let boundaryAt = 0;
let browserProgress = 0;
const voiceBuf = new Uint8Array(256);
const speakingListeners = new Set<(speaking: boolean) => void>();

function setSpeaking(text: string | null): void {
  const was = speakingText !== null;
  speakingText = text;
  if (was !== (text !== null)) for (const l of speakingListeners) l(text !== null);
}

/** Be told when the interviewer starts or stops talking. Returns an unsubscribe. */
export function onSpeakingChange(listener: (speaking: boolean) => void): () => void {
  speakingListeners.add(listener);
  return () => speakingListeners.delete(listener);
}

/**
 * Create (or resume) the page's AudioContext. Call it from a click: browsers only start
 * audio processing after a user gesture.
 */
export function primeAudio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export interface SpeechActivity {
  speaking: boolean;
  /** Raw loudness 0-1 (smooth it before drawing). */
  level: number;
  /** How far through the line, 0-1, for captions. */
  progress: number;
  text: string | null;
}

/** Polled every animation frame. Cheap: one analyser read at most. */
export function speechActivity(rms: (samples: Uint8Array) => number): SpeechActivity {
  if (speakingText === null) return { speaking: false, level: 0, progress: 0, text: null };
  if (current && voiceAnalyser) {
    voiceAnalyser.getByteTimeDomainData(voiceBuf);
    const d = current.duration;
    return { speaking: true, level: rms(voiceBuf), progress: d && Number.isFinite(d) ? current.currentTime / d : 0, text: speakingText };
  }
  // Browser voice: a pulse on each word, fading over ~180ms, over a low floor.
  const since = performance.now() - boundaryAt;
  const level = 0.18 + 0.55 * Math.exp(-since / 180);
  return { speaking: true, level, progress: browserProgress, text: speakingText };
}

/** Open the microphone just to measure how loud you are. Audio never leaves the page. */
export async function openMicLevel(rms: (samples: Uint8Array) => number): Promise<{ level: () => number; close: () => void } | null> {
  const ac = primeAudio();
  if (!ac || !navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const src = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser();
    an.fftSize = 512;
    src.connect(an); // not to the speakers - no echo
    const buf = new Uint8Array(an.fftSize);
    return {
      level: () => {
        an.getByteTimeDomainData(buf);
        return rms(buf);
      },
      close: () => {
        src.disconnect();
        stream.getTracks().forEach((t) => t.stop());
      },
    };
  } catch {
    return null;
  }
}

function done(): void {
  setSpeaking(null);
  const s = settle;
  settle = null;
  s?.();
}

/** Stop whatever is being said, by either voice. */
export function stopSpeaking(): void {
  generation++;
  if (current) {
    current.pause();
    current = null;
  }
  voiceAnalyser = null;
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  done();
}

function browserSpeak(text: string, lang: string, rate: number, mine: number): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve();
  return new Promise((resolve) => {
    settle = resolve;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    u.onstart = () => {
      if (mine !== generation) return;
      browserProgress = 0;
      boundaryAt = performance.now();
      setSpeaking(text);
    };
    u.onboundary = (e) => {
      if (mine !== generation) return;
      boundaryAt = performance.now();
      browserProgress = text.length ? e.charIndex / text.length : 0;
    };
    u.onend = u.onerror = () => {
      if (mine === generation) done();
    };
    window.speechSynthesis.speak(u);
  });
}

/**
 * Read text aloud, cancelling anything already being spoken. Resolves when the line has
 * finished (or was stopped), so a caller can start listening once the interviewer is done.
 */
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
        const audio = new Audio(currentUrl);
        current = audio;
        // Route through an analyser when we can, so the avatar moves with the voice. Only into
        // a running context: a suspended one would swallow the audio.
        if (ctx && ctx.state === "running") {
          try {
            const an = ctx.createAnalyser();
            an.fftSize = 256;
            ctx.createMediaElementSource(audio).connect(an);
            an.connect(ctx.destination);
            voiceAnalyser = an;
          } catch {
            voiceAnalyser = null;
          }
        }
        const finished = new Promise<void>((resolve) => {
          settle = resolve;
        });
        audio.onended = audio.onerror = () => {
          if (mine === generation) stopSpeaking();
        };
        audio.onplaying = () => {
          if (mine === generation) setSpeaking(text);
        };
        await audio.play();
        return finished;
      }
    } catch {
      /* network or autoplay failure - use the browser voice */
    }
  }
  if (mine !== generation) return;
  return browserSpeak(text, lang, rate, mine);
}
