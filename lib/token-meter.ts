import type { TokenLedgerEntry } from "./types";

/** Append immutably - callers keep the returned ledger. */
export function addEntry(ledger: TokenLedgerEntry[], entry: TokenLedgerEntry): TokenLedgerEntry[] {
  return [...ledger, entry];
}

/** Total tokens (in + out) per module. */
export function totalsByModule(ledger: TokenLedgerEntry[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of ledger) {
    totals[e.module] = (totals[e.module] ?? 0) + e.tokensIn + e.tokensOut;
  }
  return totals;
}

export interface BudgetStatus {
  used: number;
  budget: number;
  level: "ok" | "warning" | "exceeded";
}

/** Warning at >= 80% of budget, exceeded at > 100%. */
export function budgetStatus(ledger: TokenLedgerEntry[], budget: number): BudgetStatus {
  const used = ledger.reduce((s, e) => s + e.tokensIn + e.tokensOut, 0);
  const level = used > budget ? "exceeded" : used >= budget * 0.8 ? "warning" : "ok";
  return { used, budget, level };
}

/**
 * A rough token count (about four characters a token) for calls whose provider does not report
 * usage - the gateway's streaming endpoint. Good enough for budgets; not a bill.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
