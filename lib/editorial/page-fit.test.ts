import { describe, it, expect } from "vitest";
import { PAGE_METRICS, charsPerLine, estimateLines, lineBudget, pageFit } from "./page-fit";

const opts = { pageSize: "A4" as const, scale: 1 };

describe("charsPerLine / lineBudget", () => {
  it("uses the base metrics at scale 1", () => {
    expect(charsPerLine("A4", 1)).toBe(PAGE_METRICS.A4.charsPerLine);
    expect(lineBudget("A4", 1)).toBe(PAGE_METRICS.A4.lines);
    expect(charsPerLine("Letter", 1)).toBe(PAGE_METRICS.Letter.charsPerLine);
    expect(lineBudget("Letter", 1)).toBe(PAGE_METRICS.Letter.lines);
  });

  it("a smaller scale fits more characters per line and more lines per page", () => {
    expect(charsPerLine("A4", 0.9)).toBeGreaterThan(charsPerLine("A4", 1));
    expect(lineBudget("A4", 0.9)).toBeGreaterThan(lineBudget("A4", 1));
    expect(charsPerLine("A4", 1.1)).toBeLessThan(charsPerLine("A4", 1));
  });

  it("Letter and A4 differ", () => {
    expect(lineBudget("Letter", 1)).not.toBe(lineBudget("A4", 1));
  });

  it("rejects a non-positive scale", () => {
    expect(() => charsPerLine("A4", 0)).toThrow();
    expect(() => lineBudget("A4", -1)).toThrow();
  });
});

describe("estimateLines", () => {
  it("is ceil(chars / charsPerLine), minimum one line for non-empty text", () => {
    expect(estimateLines("x".repeat(250), 100)).toBe(3);
    expect(estimateLines("x".repeat(100), 100)).toBe(1);
    expect(estimateLines("x".repeat(101), 100)).toBe(2);
    expect(estimateLines("short", 100)).toBe(1);
  });

  it("empty text takes no lines", () => {
    expect(estimateLines("", 100)).toBe(0);
    expect(estimateLines("   ", 100)).toBe(0);
  });
});

describe("pageFit", () => {
  const cpl = charsPerLine("A4", 1);

  it("sums overhead + summary + bullet lines and reports zero overflow when it fits", () => {
    const fit = pageFit({ bullets: ["a".repeat(cpl * 2), "b".repeat(10)], summaryLine: "one line", overheadLines: 10 }, opts);
    expect(fit.perBullet).toEqual([2, 1]);
    expect(fit.linesUsed).toBe(10 + 1 + 3);
    expect(fit.lineBudget).toBe(lineBudget("A4", 1));
    expect(fit.overflow).toBe(0);
    expect(fit.slack).toBe(fit.lineBudget - fit.linesUsed);
  });

  it("an empty summary line costs nothing", () => {
    const fit = pageFit({ bullets: ["x"], summaryLine: "", overheadLines: 0 }, opts);
    expect(fit.linesUsed).toBe(1);
  });

  it("reports the overflow when the page runs long, and zero slack", () => {
    const budget = lineBudget("A4", 1);
    const bullets = Array.from({ length: budget + 3 }, () => "one line each");
    const fit = pageFit({ bullets, summaryLine: "", overheadLines: 0 }, opts);
    expect(fit.overflow).toBe(3);
    expect(fit.slack).toBe(0);
  });

  it("a smaller scale can turn an overflow into a fit", () => {
    const budget = lineBudget("A4", 1);
    // 60% of the budget as two-line bullets at scale 1 -> 20% over.
    const bullets = Array.from({ length: Math.ceil(budget * 0.6) }, () => "z".repeat(cpl + 1));
    const at1 = pageFit({ bullets, summaryLine: "", overheadLines: 0 }, { pageSize: "A4", scale: 1 });
    const at09 = pageFit({ bullets, summaryLine: "", overheadLines: 0 }, { pageSize: "A4", scale: 0.9 });
    expect(at1.overflow).toBeGreaterThan(0);
    expect(at09.overflow).toBe(0);
  });

  it("is deterministic", () => {
    const input = { bullets: ["alpha beta", "gamma"], summaryLine: "s", overheadLines: 4 };
    expect(pageFit(input, opts)).toEqual(pageFit(input, opts));
  });
});
