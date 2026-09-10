import { z } from "zod";
import { ATS_KINDS, detectAts } from "./ats";

/**
 * A declared target company (DESIGN.md section 4: "the watchlist is new").
 * Distinct from sector_nodes.companies, which only accumulates companies
 * observed in pasted JDs. Decision 8 resolved as: the watchlist is global per
 * user, not per sector node.
 */
export const AtsKindSchema = z.enum(ATS_KINDS);

export const WatchlistEntrySchema = z.object({
  id: z.string(),
  company: z.string().min(1),
  careersUrl: z.string().min(1),
  ats: AtsKindSchema,
  /** Board token / company slug; null until derived or entered by hand. */
  token: z.string().nullable(),
  active: z.boolean(),
  addedAt: z.string(), // ISO date
});
export type WatchlistEntry = z.infer<typeof WatchlistEntrySchema>;

export type NewWatchlistEntry = Omit<WatchlistEntry, "id">;

/** Build a new entry from the pasted careers URL, deriving ATS + token where possible. */
export function newWatchlistEntry(company: string, careersUrl: string, addedAt: string): NewWatchlistEntry {
  const { ats, token } = detectAts(careersUrl);
  return { company, careersUrl, ats, token, active: true, addedAt };
}
