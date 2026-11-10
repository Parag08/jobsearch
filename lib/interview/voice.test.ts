import { describe, expect, it } from "vitest";
import {
  combineVoice,
  deliveryNotes,
  hedgeCounts,
  parseVoiceSummary,
  pitchHz,
  summarizeVoice,
  voicePromptLine,
  type VoiceFrame,
  type VoiceSummary,
} from "./voice";

const SR = 48000;

function sine(hz: number, n = 2048, amp = 0.3): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
}

/** A voiced tone with harmonics, closer to speech than a pure sine. */
function voiced(hz: number, n = 2048): Float32Array {
  return Float32Array.from(
    { length: n },
    (_, i) =>
      0.3 * Math.sin((2 * Math.PI * hz * i) / SR) +
      0.15 * Math.sin((2 * Math.PI * 2 * hz * i) / SR) +
      0.08 * Math.sin((2 * Math.PI * 3 * hz * i) / SR),
  );
}

describe("pitchHz", () => {
  it("finds the pitch of a pure tone", () => {
    expect(pitchHz(sine(150), SR)).toBeCloseTo(150, 0);
    expect(pitchHz(sine(220), SR)).toBeCloseTo(220, 0);
  });

  it("finds the fundamental of a tone with harmonics, not an overtone", () => {
    expect(pitchHz(voiced(120), SR)).toBeCloseTo(120, 0);
  });

  it("is null for silence and for noise", () => {
    expect(pitchHz(new Float32Array(2048), SR)).toBeNull();
    let seed = 7;
    const noise = Float32Array.from({ length: 2048 }, () => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647 - 0.5) * 0.6;
    });
    expect(pitchHz(noise, SR)).toBeNull();
  });
});

const FRAME = 50;

/** Build frames: [ms of speech at a pitch] or [ms of silence]. */
function frames(...parts: (["speak", number, number] | ["quiet", number])[]): VoiceFrame[] {
  const out: VoiceFrame[] = [];
  let t = 0;
  for (const p of parts) {
    const n = Math.round(p[1] / FRAME);
    for (let i = 0; i < n; i++) {
      out.push(p[0] === "speak" ? { t, rms: 0.12, pitch: p[2] * (1 + 0.02 * Math.sin(i)) } : { t, rms: 0.004, pitch: null });
      t += FRAME;
    }
  }
  return out;
}

describe("summarizeVoice", () => {
  it("measures speaking time and pace, ignoring silence before and after", () => {
    const s = summarizeVoice(frames(["quiet", 1000], ["speak", 30000, 140], ["quiet", 2500]), FRAME, 75)!;
    expect(s.speakingSeconds).toBeCloseTo(30, 0);
    expect(s.wordsPerMinute).toBe(150);
    expect(s.pauses).toBe(0);
  });

  it("counts pauses inside the answer and the longest one", () => {
    const s = summarizeVoice(
      frames(["speak", 5000, 140], ["quiet", 800], ["speak", 5000, 140], ["quiet", 3200], ["speak", 5000, 140], ["quiet", 200], ["speak", 2000, 140]),
      FRAME,
      40,
    )!;
    expect(s.pauses).toBe(2); // the 200ms gap is a breath, not a pause
    expect(s.longestPauseSeconds).toBeCloseTo(3.2, 1);
  });

  it("measures how much the pitch moves, in semitones", () => {
    const flat = summarizeVoice(frames(["speak", 20000, 140]), FRAME, 50)!;
    const lively = summarizeVoice(
      frames(["speak", 4000, 110], ["speak", 4000, 170], ["speak", 4000, 125], ["speak", 4000, 190], ["speak", 4000, 140]),
      FRAME,
      50,
    )!;
    expect(flat.pitchVariation!).toBeLessThan(1);
    expect(lively.pitchVariation!).toBeGreaterThan(3);
    expect(lively.medianPitchHz!).toBeGreaterThan(120);
  });

  it("is null when nothing was said", () => {
    expect(summarizeVoice([], FRAME, 0)).toBeNull();
    expect(summarizeVoice(frames(["quiet", 5000]), FRAME, 0)).toBeNull();
  });

  it("leaves pitch null when too little of it was voiced", () => {
    const s = summarizeVoice(frames(["speak", 200, 140]), FRAME, 2)!;
    expect(s.pitchVariation).toBeNull();
    expect(s.medianPitchHz).toBeNull();
  });
});

describe("combineVoice", () => {
  const a: VoiceSummary = { speakingSeconds: 60, words: 150, wordsPerMinute: 150, pauses: 4, longestPauseSeconds: 1.5, medianPitchHz: 130, pitchVariation: 2.5 };
  const b: VoiceSummary = { speakingSeconds: 20, words: 60, wordsPerMinute: 180, pauses: 2, longestPauseSeconds: 3, medianPitchHz: 140, pitchVariation: 1.5 };

  it("adds time and pauses, recomputes pace, keeps the longest pause, weights pitch by time", () => {
    const c = combineVoice([a, b])!;
    expect(c.speakingSeconds).toBe(80);
    expect(c.words).toBe(210);
    expect(c.wordsPerMinute).toBe(158);
    expect(c.pauses).toBe(6);
    expect(c.longestPauseSeconds).toBe(3);
    expect(c.pitchVariation).toBeCloseTo(2.25, 2);
    expect(c.medianPitchHz).toBeCloseTo(132.5, 1);
  });

  it("is null for no spoken answers", () => {
    expect(combineVoice([])).toBeNull();
  });
});

describe("hedgeCounts", () => {
  it("counts hedges and the fillers that survive transcription", () => {
    const text = "So basically I sort of led it, you know, and I guess it basically worked. Um, I mean it did. I like the team.";
    expect(hedgeCounts(text)).toEqual({ basically: 2, "sort of": 1, "you know": 1, "i guess": 1, um: 1, "i mean": 1 });
  });

  it("does not count 'like' - it is a verb too often to call", () => {
    expect(hedgeCounts("I like data and I would like more")).toEqual({});
  });
});

describe("deliveryNotes", () => {
  const base: VoiceSummary = { speakingSeconds: 90, words: 215, wordsPerMinute: 143, pauses: 6, longestPauseSeconds: 1.4, medianPitchHz: 130, pitchVariation: 2.8 };

  it("praises a well-paced, varied delivery", () => {
    const n = deliveryNotes(base, {});
    expect(n.every((x) => x.tone === "hit")).toBe(true);
    expect(n.map((x) => x.kind)).toEqual(expect.arrayContaining(["pace", "pitch"]));
  });

  it("flags fast, monotone, choppy and hedging", () => {
    const n = deliveryNotes(
      { ...base, wordsPerMinute: 190, pitchVariation: 1.2, pauses: 30, longestPauseSeconds: 4 },
      { basically: 3, "sort of": 2 },
    );
    const gaps = n.filter((x) => x.tone === "gap").map((x) => x.kind);
    expect(gaps).toEqual(expect.arrayContaining(["pace", "pitch", "pauses", "hesitation", "hedges"]));
    expect(n.find((x) => x.kind === "hedges")?.text).toContain("basically ×3");
  });

  it("flags a slow pace", () => {
    expect(deliveryNotes({ ...base, wordsPerMinute: 100 }, {}).find((x) => x.kind === "pace")?.tone).toBe("gap");
  });

  it("says nothing about pitch it could not measure", () => {
    expect(deliveryNotes({ ...base, pitchVariation: null, medianPitchHz: null }, {}).some((x) => x.kind === "pitch")).toBe(false);
  });
});

describe("voicePromptLine", () => {
  it("states the measurements for the model, and nothing when there are none", () => {
    const v: VoiceSummary = { speakingSeconds: 60, words: 150, wordsPerMinute: 150, pauses: 3, longestPauseSeconds: 1.2, medianPitchHz: 130, pitchVariation: 1.6 };
    const line = voicePromptLine(v, { basically: 2 });
    expect(line).toContain("pace 150 words/min");
    expect(line).toContain("pitch variation 1.6 semitones");
    expect(line).toContain("3 pauses, longest 1.2s");
    expect(line).toContain('"basically" x2');
    expect(voicePromptLine(null, {})).toBe("");
  });
});

describe("parseVoiceSummary", () => {
  const ok: VoiceSummary = { speakingSeconds: 60, words: 150, wordsPerMinute: 150, pauses: 3, longestPauseSeconds: 1.2, medianPitchHz: 130, pitchVariation: 1.6 };
  it("accepts a real summary and rejects nonsense", () => {
    expect(parseVoiceSummary(ok)).toEqual(ok);
    expect(parseVoiceSummary({ ...ok, wordsPerMinute: -4 })).toBeNull();
    expect(parseVoiceSummary({ ...ok, pauses: "lots" })).toBeNull();
    expect(parseVoiceSummary(null)).toBeNull();
  });
});
