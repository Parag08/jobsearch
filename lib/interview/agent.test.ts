import { describe, expect, it } from "vitest";
import { agentState, captionWindow, rmsLevel, smoothLevel } from "./agent";

describe("agentState", () => {
  const base = { ended: false, busy: false, speaking: false, listening: false };

  it("is idle when nothing is happening", () => {
    expect(agentState(base)).toBe("idle");
  });

  it("speaking wins over thinking and listening", () => {
    expect(agentState({ ...base, speaking: true, busy: true, listening: true })).toBe("speaking");
  });

  it("thinks while waiting for the next line", () => {
    expect(agentState({ ...base, busy: true, listening: true })).toBe("thinking");
  });

  it("listens while the microphone is open", () => {
    expect(agentState({ ...base, listening: true })).toBe("listening");
  });

  it("is done once the interview has ended, whatever else is true", () => {
    expect(agentState({ ended: true, busy: true, speaking: true, listening: true })).toBe("done");
  });
});

describe("rmsLevel", () => {
  it("is 0 for silence (time-domain samples centred on 128)", () => {
    expect(rmsLevel(new Uint8Array(64).fill(128))).toBe(0);
  });

  it("rises with loudness and is clamped to 1", () => {
    const quiet = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 133 : 123));
    const loud = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0));
    expect(rmsLevel(quiet)).toBeGreaterThan(0);
    expect(rmsLevel(quiet)).toBeLessThan(rmsLevel(loud));
    expect(rmsLevel(loud)).toBe(1);
  });

  it("is 0 for no samples", () => {
    expect(rmsLevel(new Uint8Array(0))).toBe(0);
  });
});

describe("smoothLevel", () => {
  it("moves towards the target, faster when rising than when falling", () => {
    const up = smoothLevel(0, 1, 16);
    const down = 1 - smoothLevel(1, 0, 16);
    expect(up).toBeGreaterThan(0);
    expect(up).toBeLessThan(1);
    expect(up).toBeGreaterThan(down);
  });

  it("reaches the target given enough time and stays within 0-1", () => {
    expect(smoothLevel(0, 1, 5000)).toBeCloseTo(1, 3);
    expect(smoothLevel(0.5, 7, 16)).toBeLessThanOrEqual(1);
    expect(smoothLevel(0.5, -3, 16)).toBeGreaterThanOrEqual(0);
  });

  it("does not move with no elapsed time", () => {
    expect(smoothLevel(0.3, 1, 0)).toBe(0.3);
  });
});

describe("captionWindow", () => {
  const line = "That is quite high level so take me to one specific moment and tell me exactly what you did";

  it("reveals words in step with progress", () => {
    expect(captionWindow(line, 0)).toBe("");
    expect(captionWindow(line, 0.2)).toBe("That is quite high");
    expect(captionWindow(line, 1)).toBe(line.split(" ").slice(-12).join(" "));
  });

  it("keeps only the most recent words, like live captions", () => {
    expect(captionWindow(line, 1, 4)).toBe("exactly what you did");
  });

  it("clamps progress outside 0-1", () => {
    expect(captionWindow("one two", 5, 12)).toBe("one two");
    expect(captionWindow("one two", -1, 12)).toBe("");
  });
});
