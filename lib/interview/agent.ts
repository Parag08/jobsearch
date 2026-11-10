/**
 * The AI interviewer's on-screen presence, as pure functions: which state it is in, how
 * loud it (or you) is, and which words of its line the live captions show. The Three.js
 * avatar and the meeting room read these; nothing here touches the DOM or audio APIs.
 */

export type AgentState = "idle" | "listening" | "thinking" | "speaking" | "done";

/** Speaking beats thinking beats listening: what the agent is doing right now, once. */
export function agentState(i: { ended: boolean; busy: boolean; speaking: boolean; listening: boolean }): AgentState {
  if (i.ended) return "done";
  if (i.speaking) return "speaking";
  if (i.busy) return "thinking";
  if (i.listening) return "listening";
  return "idle";
}

/** Gain so ordinary speech (RMS around 0.1-0.25) fills most of the 0-1 range. */
const LEVEL_GAIN = 4;

/**
 * Loudness 0-1 from an AnalyserNode's byte time-domain samples (silence = 128).
 */
export function rmsLevel(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = (samples[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * LEVEL_GAIN);
}

/**
 * Follow a level smoothly: quick to rise (a word starting), slower to fall, so the avatar
 * breathes with speech instead of flickering. Frame-rate independent.
 */
export function smoothLevel(prev: number, target: number, dtMs: number, attackMs = 60, releaseMs = 240): number {
  const t = Math.min(1, Math.max(0, target));
  if (dtMs <= 0) return prev;
  const tau = t > prev ? attackMs : releaseMs;
  const k = 1 - Math.exp(-dtMs / tau);
  return Math.min(1, Math.max(0, prev + (t - prev) * k));
}

/**
 * Live captions: the words spoken so far (by progress 0-1 through the line), keeping only
 * the most recent `maxWords`, the way meeting captions roll.
 */
export function captionWindow(text: string, progress: number, maxWords = 12): string {
  const words = text.split(/\s+/).filter(Boolean);
  const p = Math.min(1, Math.max(0, progress));
  const shown = words.slice(0, Math.ceil(p * words.length));
  return shown.slice(-maxWords).join(" ");
}
