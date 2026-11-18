/**
 * How you said it, measured - not judged - from the microphone, in the page.
 *
 * The browser hands us raw samples while you answer; we keep only numbers per ~50ms frame
 * (loudness, pitch). Nothing here sees or stores audio, and only the summary below - pace,
 * pauses, pitch movement - is ever sent to the server. Rules, not tokens (token rule #2):
 * the model is told these measurements, it never listens.
 *
 * Fillers: the browser's transcription drops most "um"/"uh", so only the hedges that survive
 * it are counted (hedgeCounts). "Like" is not counted - it is a verb too often to call.
 */

import { z } from "zod";

export interface VoiceFrame {
  /** ms since the answer started */
  t: number;
  /** RMS of the raw samples, 0-1 */
  rms: number;
  /** Fundamental frequency, or null when unvoiced */
  pitch: number | null;
}

export interface VoiceSummary {
  /** From the first word to the last, pauses included. */
  speakingSeconds: number;
  words: number;
  wordsPerMinute: number | null;
  /** Silences of at least PAUSE_MS inside the answer. */
  pauses: number;
  longestPauseSeconds: number;
  medianPitchHz: number | null;
  /** Standard deviation of pitch in semitones: under ~2 sounds flat. */
  pitchVariation: number | null;
}

const MIN_HZ = 70;
const MAX_HZ = 400;
const YIN_THRESHOLD = 0.15;
const MIN_VOICED_RMS = 0.01;

/**
 * Pitch of one frame by YIN (de Cheveigné & Kawahara): robust against octave errors on
 * voiced speech. Null for silence, noise and anything outside a speaking voice's range.
 */
export function pitchHz(samples: Float32Array, sampleRate: number): number | null {
  let energy = 0;
  for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
  if (Math.sqrt(energy / Math.max(1, samples.length)) < MIN_VOICED_RMS) return null;

  const minTau = Math.floor(sampleRate / MAX_HZ);
  const maxTau = Math.min(Math.floor(sampleRate / MIN_HZ), Math.floor(samples.length / 2));
  const w = samples.length - maxTau;
  if (w <= 0 || minTau >= maxTau) return null;

  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    let d = 0;
    for (let i = 0; i < w; i++) {
      const diff = samples[i] - samples[i + tau];
      d += diff * diff;
    }
    running += d;
    cmnd[tau] = running > 0 ? (d * tau) / running : 1;
  }

  for (let tau = minTau; tau <= maxTau; tau++) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
      // Parabolic interpolation around the dip, for sub-sample accuracy.
      const a = cmnd[tau - 1] ?? cmnd[tau];
      const b = cmnd[tau];
      const c = cmnd[tau + 1] ?? cmnd[tau];
      const den = a - 2 * b + c;
      const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
      const hz = sampleRate / (tau + shift);
      return hz >= MIN_HZ && hz <= MAX_HZ ? hz : null;
    }
  }
  return null;
}

/** A silence this long inside an answer is a pause; shorter is a breath. */
const PAUSE_MS = 600;
const MIN_PITCHED_FRAMES = 10;
/** Speech threshold: well above the room's quietest frames, within sane bounds. */
const SPEECH_FLOOR = 0.015;
const SPEECH_CEIL = 0.05;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
}

/** Summarise one spoken answer. Null when nothing was said. */
export function summarizeVoice(frames: VoiceFrame[], frameMs: number, words: number): VoiceSummary | null {
  if (!frames.length) return null;
  const sorted = frames.map((f) => f.rms).sort((x, y) => x - y);
  const threshold = Math.max(SPEECH_FLOOR, Math.min(SPEECH_CEIL, percentile(sorted, 0.1) * 3));
  const speech = frames.map((f) => f.rms >= threshold);

  const first = speech.indexOf(true);
  const last = speech.lastIndexOf(true);
  if (first < 0) return null;

  let pauses = 0;
  let longest = 0;
  let run = 0;
  for (let i = first; i <= last; i++) {
    if (!speech[i]) {
      run += frameMs;
      continue;
    }
    if (run >= PAUSE_MS) pauses++;
    longest = Math.max(longest, run);
    run = 0;
  }

  const speakingSeconds = (frames[last].t - frames[first].t + frameMs) / 1000;

  const semis: number[] = [];
  const pitches = frames.filter((f, i) => speech[i] && f.pitch !== null).map((f) => f.pitch as number);
  let medianPitchHz: number | null = null;
  let pitchVariation: number | null = null;
  if (pitches.length >= MIN_PITCHED_FRAMES) {
    const ps = [...pitches].sort((x, y) => x - y);
    medianPitchHz = ps[Math.floor(ps.length / 2)];
    for (const p of pitches) semis.push(12 * Math.log2(p / medianPitchHz));
    const mean = semis.reduce((a, b) => a + b, 0) / semis.length;
    pitchVariation = Math.sqrt(semis.reduce((a, b) => a + (b - mean) ** 2, 0) / semis.length);
  }

  return {
    speakingSeconds: Math.round(speakingSeconds * 10) / 10,
    words,
    wordsPerMinute: speakingSeconds > 0 && words > 0 ? Math.round((words / speakingSeconds) * 60) : null,
    pauses,
    longestPauseSeconds: Math.round((longest / 1000) * 10) / 10,
    medianPitchHz: medianPitchHz === null ? null : Math.round(medianPitchHz),
    pitchVariation: pitchVariation === null ? null : Math.round(pitchVariation * 100) / 100,
  };
}

/** Several spoken answers as one: time and pauses add, pace is recomputed, pitch is time-weighted. */
export function combineVoice(list: VoiceSummary[]): VoiceSummary | null {
  if (!list.length) return null;
  const speakingSeconds = list.reduce((a, s) => a + s.speakingSeconds, 0);
  const words = list.reduce((a, s) => a + s.words, 0);
  const pitched = list.filter((s) => s.pitchVariation !== null && s.medianPitchHz !== null);
  const pitchTime = pitched.reduce((a, s) => a + s.speakingSeconds, 0);
  const weighted = (k: "pitchVariation" | "medianPitchHz") =>
    pitchTime > 0 ? pitched.reduce((a, s) => a + (s[k] as number) * s.speakingSeconds, 0) / pitchTime : null;
  return {
    speakingSeconds: Math.round(speakingSeconds * 10) / 10,
    words,
    wordsPerMinute: speakingSeconds > 0 && words > 0 ? Math.round((words / speakingSeconds) * 60) : null,
    pauses: list.reduce((a, s) => a + s.pauses, 0),
    longestPauseSeconds: Math.max(...list.map((s) => s.longestPauseSeconds)),
    medianPitchHz: weighted("medianPitchHz"),
    pitchVariation: weighted("pitchVariation"),
  };
}

const HEDGES = ["basically", "sort of", "kind of", "you know", "i guess", "i mean", "actually", "literally", "um", "uh", "erm"];

/** Hedges and fillers that survive the browser's transcription. Only the ones used. */
export function hedgeCounts(text: string): Record<string, number> {
  const t = text.toLowerCase();
  const out: Record<string, number> = {};
  for (const h of HEDGES) {
    const n = (t.match(new RegExp(`\\b${h.replace(/ /g, "\\s+")}\\b`, "g")) ?? []).length;
    if (n) out[h] = n;
  }
  return out;
}

/** "like" is a filler unless a word around it makes it a real word ("would like to", "looks like"). */
const LIKE_REAL_BEFORE = new Set(["would", "i'd", "you'd", "we'd", "they'd", "he'd", "she'd", "look", "looks", "looked", "looking", "feel", "feels", "felt", "seem", "seems", "seemed", "sound", "sounds", "sounded", "things", "something", "anything", "nothing", "more", "much", "just"]);
const LIKE_REAL_AFTER = new Set(["to", "that", "this", "it", "them", "him", "her"]);
/** Short connecting words a transcriber often doubles; a doubled one is not worth flagging. */
const REPEAT_IGNORE = new Set(["that", "this", "with", "have", "then", "from", "they", "were", "what"]);
const FILLER_WORDS = ["um", "uh", "erm", "basically", "actually", "literally"];
const FILLER_PHRASES = ["you know", "i mean", "sort of", "kind of"];

export interface FillerReport {
  /** Filler -> times said; only the ones used. */
  counts: Record<string, number>;
  /** Words said twice in a row ("business business"), in order, once each. */
  repeats: string[];
  /** Fillers plus repeats. */
  total: number;
  words: number;
  /** total per 100 words, one decimal; 0 for no words. */
  per100: number;
}

/**
 * Fillers in what the candidate said, measured on the transcript (speech-to-text keeps
 * most "um"/"uh"). Rules only, the same every time. Per 100 words, so a long answer and a
 * short one compare fairly.
 */
export function fillerReport(text: string): FillerReport {
  const tokens = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  tokens.forEach((t, i) => {
    if (FILLER_WORDS.includes(t)) bump(t);
    if (t === "like" && !LIKE_REAL_BEFORE.has(tokens[i - 1] ?? "") && !LIKE_REAL_AFTER.has(tokens[i + 1] ?? "")) bump("like");
    for (const p of FILLER_PHRASES) {
      const [a, b] = p.split(" ");
      if (t === a && tokens[i + 1] === b) bump(p);
    }
  });
  const repeats: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === tokens[i - 1] && t.length >= 4 && !REPEAT_IGNORE.has(t) && !repeats.includes(`${t} ${t}`)) repeats.push(`${t} ${t}`);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) + repeats.length;
  const words = tokens.length;
  return { counts, repeats, total, words, per100: words ? Math.round((total / words) * 1000) / 10 : 0 };
}

/** Over this many fillers per 100 words, the answer sounds unsure. */
export const FILLERS_PER_100_LIMIT = 2;

/** One plain line for the page and the model. */
export function fillerLine(r: FillerReport): string {
  if (!r.words) return "";
  const list = Object.entries(r.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `"${k}" ×${n}`);
  if (r.repeats.length) list.push(`repeated words ×${r.repeats.length} (${r.repeats.slice(0, 3).join(", ")})`);
  return `${r.total} fillers in ${r.words} words (${r.per100} per 100)${list.length ? `: ${list.join(", ")}` : ""}.`;
}

export interface DeliveryNote {
  kind: "pace" | "pitch" | "pauses" | "hesitation" | "hedges";
  tone: "hit" | "gap";
  text: string;
}

const FAST_WPM = 175;
const SLOW_WPM = 115;
const FLAT_SEMITONES = 2;
const CHOPPY_PAUSES_PER_MIN = 12;
const HESITATION_SECONDS = 3;
const HEDGE_LIMIT = 3;

/** Plain-English notes from the measurements - the same thresholds every time. */
export function deliveryNotes(v: VoiceSummary, hedges: Record<string, number>): DeliveryNote[] {
  const notes: DeliveryNote[] = [];
  if (v.wordsPerMinute !== null) {
    const w = v.wordsPerMinute;
    notes.push(
      w > FAST_WPM
        ? { kind: "pace", tone: "gap", text: `Fast: ${w} words a minute. Slow down around the result and the numbers.` }
        : w < SLOW_WPM
          ? { kind: "pace", tone: "gap", text: `Slow: ${w} words a minute. Tighten the set-up and get to the point sooner.` }
          : { kind: "pace", tone: "hit", text: `Good pace: ${w} words a minute.` },
    );
  }
  if (v.pitchVariation !== null) {
    notes.push(
      v.pitchVariation < FLAT_SEMITONES
        ? { kind: "pitch", tone: "gap", text: "Flat delivery: your pitch barely moved. Lift your voice on the result and the key decision." }
        : { kind: "pitch", tone: "hit", text: "Your voice had natural movement - it sounded engaged." },
    );
  }
  const minutes = v.speakingSeconds / 60;
  if (minutes > 0 && v.pauses / minutes > CHOPPY_PAUSES_PER_MIN) {
    notes.push({ kind: "pauses", tone: "gap", text: `Choppy: ${v.pauses} pauses. Know your next sentence before you start it.` });
  }
  if (v.longestPauseSeconds >= HESITATION_SECONDS) {
    notes.push({ kind: "hesitation", tone: "gap", text: `A ${v.longestPauseSeconds}s hesitation mid-answer. A short "let me think" reads better than silence.` });
  }
  const total = Object.values(hedges).reduce((a, b) => a + b, 0);
  if (total >= HEDGE_LIMIT) {
    const list = Object.entries(hedges)
      .sort((a, b) => b[1] - a[1])
      .map(([h, n]) => `${h} ×${n}`)
      .join(", ");
    notes.push({ kind: "hedges", tone: "gap", text: `Hedging words: ${list}. They undercut what you did.` });
  }
  return notes;
}

/** One line for the model, so its delivery comments rest on measurements, not guesses. */
export function voicePromptLine(v: VoiceSummary | null, hedges: Record<string, number>): string {
  const parts: string[] = [];
  if (v) {
    if (v.wordsPerMinute !== null) parts.push(`pace ${v.wordsPerMinute} words/min`);
    if (v.pitchVariation !== null) parts.push(`pitch variation ${v.pitchVariation} semitones (under 2 sounds flat)`);
    parts.push(`${v.pauses} pauses, longest ${v.longestPauseSeconds}s`);
  }
  const h = Object.entries(hedges).map(([k, n]) => `"${k}" x${n}`);
  if (h.length) parts.push(`hedges: ${h.join(", ")}`);
  return parts.length ? `Measured delivery (from the microphone, not judged): ${parts.join("; ")}.` : "";
}

const num = (max: number) => z.number().finite().min(0).max(max);

/** The summary crosses the wire from the page, so it is validated before it is believed. */
export const VoiceSummarySchema = z.object({
  speakingSeconds: num(3600),
  words: z.number().int().min(0).max(20000),
  wordsPerMinute: num(600).nullable(),
  pauses: z.number().int().min(0).max(2000),
  longestPauseSeconds: num(3600),
  medianPitchHz: num(1000).nullable(),
  pitchVariation: num(48).nullable(),
});

export function parseVoiceSummary(raw: unknown): VoiceSummary | null {
  const r = VoiceSummarySchema.safeParse(raw);
  return r.success ? r.data : null;
}
