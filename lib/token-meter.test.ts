import { describe, it, expect } from "vitest";
import { addEntry, totalsByModule, budgetStatus } from "./token-meter";
import type { TokenLedgerEntry } from "./types";

const e = (module: string, tokensIn: number, tokensOut: number): TokenLedgerEntry => ({
  date: "2026-08-29",
  module,
  model: "gemini-free",
  tokensIn,
  tokensOut,
});

describe("token meter", () => {
  it("appends entries immutably", () => {
    const ledger: TokenLedgerEntry[] = [];
    const next = addEntry(ledger, e("process-jd", 1000, 200));
    expect(ledger).toHaveLength(0);
    expect(next).toHaveLength(1);
  });

  it("totals tokens by module", () => {
    const ledger = [e("process-jd", 1000, 200), e("process-jd", 500, 100), e("tailor-cv", 4000, 800)];
    const t = totalsByModule(ledger);
    expect(t["process-jd"]).toBe(1800);
    expect(t["tailor-cv"]).toBe(4800);
  });

  it("reports budget status with a warning past 80% and exceeded past 100%", () => {
    const ledger = [e("tailor-cv", 8500, 0)];
    expect(budgetStatus(ledger, 10000).level).toBe("warning");
    expect(budgetStatus([...ledger, e("x", 2000, 0)], 10000).level).toBe("exceeded");
    expect(budgetStatus([e("x", 100, 0)], 10000).level).toBe("ok");
  });
});
