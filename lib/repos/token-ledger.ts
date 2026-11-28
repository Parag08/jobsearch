import type { TokenLedgerEntry } from "../types";
import { LIST_LIMIT, many, one, type DbClient } from "./db";
import { toTokenLedgerEntry, tokenLedgerRow } from "./rows";

/** Every LLM call gets logged (token rule #6); totals/budgets are computed by lib/token-meter. */
export async function logTokens(
  db: DbClient,
  userId: string,
  entry: TokenLedgerEntry,
): Promise<TokenLedgerEntry> {
  const row = await one(
    db.from("token_ledger").insert(tokenLedgerRow(userId, entry)).select().single(),
    "token_ledger",
    "log",
  );
  return toTokenLedgerEntry(row);
}

export async function listTokenLedger(db: DbClient, userId: string): Promise<TokenLedgerEntry[]> {
  const rows = await many(
    db.from("token_ledger").select("date,module,model,tokens_in,tokens_out")
      .eq("user_id", userId).order("date", { ascending: false }).limit(LIST_LIMIT),
    "token_ledger",
    "list",
  );
  return rows.map(toTokenLedgerEntry);
}
