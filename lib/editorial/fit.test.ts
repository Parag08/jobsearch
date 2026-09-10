import { describe, it, expect } from "vitest";
import { fitToPage, resolveText } from "./fit";
import { charsPerLine, lineBudget } from "./page-fit";
import type { EditorialBullet, Selection, SelectionDecision } from "./select";

const CPL = charsPerLine("A4", 1);
const BUDGET = lineBudget("A4", 1);
const twoLines = (c: string) => c.repeat(CPL + 50); // 2 lines
const oneLine = (c: string) => c.repeat(CPL - 20); // 1 line

function eb(id: string, orgId: string, text: string, extra: Partial<EditorialBullet> = {}): EditorialBullet {
  return { id, projectId: `p-${orgId}`, roleFamily: "product-management", text, skills: [], orgId, ...extra };
}

// p: pinned, score 3, 2 lines, no short variant
// h: score 9, 2 lines, short -> 1 line
// l: score 2, 2 lines, short -> 1 line
// m: score 5, 1 line, no short
const bank: Record<string, EditorialBullet> = {
  p: eb("p", "org-a", twoLines("p")),
  h: eb("h", "org-b", twoLines("h"), { variants: [{ label: "short", text: oneLine("H") }, { label: "customer-forward", text: twoLines("h") }] }),
  l: eb("l", "org-c", twoLines("l"), { variants: [{ label: "short", text: oneLine("L") }] }),
  m: eb("m", "org-c", oneLine("m")),
};

function decision(bulletId: string, score: number, kind: SelectionDecision["kind"] = "scored"): SelectionDecision {
  return { bulletId, included: true, kind, reason: "", score, orgId: bank[bulletId].orgId };
}

const selection: Selection = {
  bulletIds: ["p", "h", "l", "m"], // 2+2+2+1 = 7 lines
  pinnedIds: ["p"],
  decisions: [decision("p", 3, "pinned"), decision("h", 9), decision("l", 2), decision("m", 5)],
};

/** overheadLines such that exactly `bulletLines` lines remain for bullets (summary empty). */
const overheadFor = (bulletLines: number) => BUDGET - bulletLines;
const opts = (bulletLines: number) => ({ pageSize: "A4" as const, scale: 1, summaryLine: "", overheadLines: overheadFor(bulletLines) });

describe("resolveText", () => {
  const b = bank.h;
  it("override > variant > base text", () => {
    expect(resolveText(b, { override: "hand-written" })).toBe("hand-written");
    expect(resolveText(b, { variant: "short" })).toBe(oneLine("H"));
    expect(resolveText(b, { variant: "short", override: "hand-written" })).toBe("hand-written");
    expect(resolveText(b)).toBe(b.text);
  });
  it("an unknown variant label falls back to the base text", () => {
    expect(resolveText(b, { variant: "nope" })).toBe(b.text);
  });
});

describe("fitToPage", () => {
  it("does nothing when the page already fits", () => {
    const out = fitToPage(selection, bank, opts(7));
    expect(out.actions).toEqual([]);
    expect(out.bulletIds).toEqual(selection.bulletIds);
    expect(out.fit.overflow).toBe(0);
    expect(out.variants).toEqual({});
  });

  it("prefers a short variant over cutting a bullet, lowest-scoring first", () => {
    const out = fitToPage(selection, bank, opts(6)); // overflow 1
    expect(out.actions).toEqual([{ kind: "short-variant", bulletId: "l", from: null, linesSaved: 1 }]);
    expect(out.bulletIds).toEqual(["p", "h", "l", "m"]);
    expect(out.variants).toEqual({ l: "short" });
    expect(out.fit.overflow).toBe(0);
  });

  it("uses every short variant before dropping anything", () => {
    const out = fitToPage(selection, bank, opts(5)); // overflow 2
    expect(out.actions.map((a) => a.kind)).toEqual(["short-variant", "short-variant"]);
    expect(out.actions.map((a) => a.bulletId)).toEqual(["l", "h"]);
    expect(out.bulletIds).toEqual(["p", "h", "l", "m"]);
    expect(out.fit.overflow).toBe(0);
  });

  it("drops the lowest-scoring unpinned bullet only once shorts are exhausted; the pin survives", () => {
    const out = fitToPage(selection, bank, opts(3)); // overflow 4
    expect(out.actions).toEqual([
      { kind: "short-variant", bulletId: "l", from: null, linesSaved: 1 },
      { kind: "short-variant", bulletId: "h", from: null, linesSaved: 1 },
      { kind: "drop", bulletId: "l", linesSaved: 1 },
      { kind: "drop", bulletId: "m", linesSaved: 1 },
    ]);
    expect(out.bulletIds).toEqual(["p", "h"]);
    expect(out.variants).toEqual({ h: "short" }); // the dropped bullet's variant choice is not carried
    expect(out.fit.overflow).toBe(0);
  });

  it("never drops a pinned bullet, even when the page still overflows", () => {
    const allPinned: Selection = {
      bulletIds: ["p", "m"],
      pinnedIds: ["p", "m"],
      decisions: [decision("p", 3, "pinned"), decision("m", 5, "pinned")],
    };
    const out = fitToPage(allPinned, bank, opts(1)); // needs 3 lines
    expect(out.bulletIds).toEqual(["p", "m"]);
    expect(out.actions).toEqual([]);
    expect(out.fit.overflow).toBe(2);
  });

  it("skips a short variant that saves no lines", () => {
    const b: Record<string, EditorialBullet> = {
      x: eb("x", "o", oneLine("x"), { variants: [{ label: "short", text: "y".repeat(10) }] }),
      z: eb("z", "o", oneLine("z")),
    };
    const d = (bulletId: string, score: number): SelectionDecision => ({ bulletId, included: true, kind: "scored", reason: "", score, orgId: "o" });
    const sel: Selection = { bulletIds: ["x", "z"], pinnedIds: [], decisions: [d("x", 1), d("z", 9)] };
    const out = fitToPage(sel, b, opts(1));
    expect(out.actions).toEqual([{ kind: "drop", bulletId: "x", linesSaved: 1 }]);
    expect(out.variants).toEqual({});
  });

  it("replaces a chosen angle variant with the short one (recording where it came from) but never touches an override", () => {
    const out = fitToPage(selection, bank, {
      ...opts(5),
      variants: { h: "customer-forward" },
      overrides: { l: twoLines("L") },
    });
    // l has an override -> not swappable; h swaps from customer-forward to short (saves 1); still 1 over -> drop l.
    expect(out.actions).toEqual([
      { kind: "short-variant", bulletId: "h", from: "customer-forward", linesSaved: 1 },
      { kind: "drop", bulletId: "l", linesSaved: 2 },
    ]);
    expect(out.variants).toEqual({ h: "short" });
    expect(out.overrides).toEqual({});
  });

  it("does not mutate the selection or the option maps", () => {
    const variants = { h: "customer-forward" };
    const before = JSON.stringify(selection);
    fitToPage(selection, bank, { ...opts(3), variants });
    expect(JSON.stringify(selection)).toBe(before);
    expect(variants).toEqual({ h: "customer-forward" });
  });
});
