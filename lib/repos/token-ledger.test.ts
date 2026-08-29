import { describe, it, expect } from "vitest";
import { totalsByModule } from "../token-meter";
import { FakeDb } from "./fake-db";
import { listTokenLedger, logTokens } from "./token-ledger";

describe("token-ledger repo", () => {
  it("logTokens + listTokenLedger round-trips and feeds the domain token meter", async () => {
    const db = new FakeDb();
    await logTokens(db, "u1", { date: "2026-08-29", module: "process-jd", model: "gemini-flash", tokensIn: 900, tokensOut: 150 });
    await logTokens(db, "u1", { date: "2026-08-29", module: "process-jd", model: "gemini-flash", tokensIn: 800, tokensOut: 100 });
    await logTokens(db, "u2", { date: "2026-08-29", module: "process-jd", model: "gemini-flash", tokensIn: 1, tokensOut: 1 });
    const ledger = await listTokenLedger(db, "u1");
    expect(ledger).toHaveLength(2);
    expect(totalsByModule(ledger)["process-jd"]).toBe(1950);
  });
});
