import ownerBank from "@/data/cvbuilder/letter-bank.json";
import demoBank from "@/data/demo/letter-bank.json";
import type { WorkspaceMode } from "../db";
import { parseLetterBank, type LetterBank } from "./index";

/**
 * The letter bank for a workspace. The demo never sees the owner's bank (data/cvbuilder/
 * is Parag's real corpus); it gets the fictional one in data/demo/. Both are imported so the
 * bundler ships them (CLAUDE.md: never read data files with fs).
 */
export function letterBankFor(w: { mode: WorkspaceMode }): LetterBank {
  return parseLetterBank(w.mode === "demo" ? demoBank : ownerBank);
}
