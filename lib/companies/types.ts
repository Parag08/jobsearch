import { z } from "zod";
import { AtsKindSchema } from "../watchlist/types";

/**
 * The company directory (DESIGN.md section 4). Unlike `watchlist`, this is
 * CENTRAL: one shared row per employer, no user_id, readable by everyone.
 * A watchlist entry is the personal act of following one of these.
 *
 * `type` records how an employer hires - the axis the 2026-09-23 sourcing run
 * showed is decisive (US tech staffs Singapore as a sales base; regional
 * platforms staff product here). It is a free string on purpose: the
 * categories live in the seed file, so adding one never touches lib/ (rule 4).
 */
export const COMPANY_SEED_PATH = "data/singapore/companies.json";

export const CompanySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.string().min(1),
  careersUrl: z.string().min(1),
  ats: AtsKindSchema,
  /** Board token / slug, verified by scripts/probe-boards.mjs. Null when unknown. */
  token: z.string().nullable(),
  /** A human checked this board is the right employer (see the probe script). */
  confirmed: z.boolean(),
  /** ISO date of the last successful probe, or null if never probed. */
  probedAt: z.string().nullable(),
});
export type Company = z.infer<typeof CompanySchema>;
export type NewCompany = Omit<Company, "id">;

/** One entry as it appears in the seed JSON. */
export interface CompanySeedEntry {
  company: string;
  type: string;
  careersUrl: string;
  ats?: string;
  token?: string | null;
  confirmed?: boolean;
  probed?: string | null;
}

/**
 * Seed entry -> directory row.
 *
 * The ats and token are taken as given, NOT re-derived from the careers URL:
 * probing verified them against the live board, and most verified boards sit
 * behind a vanity careers domain that `detectAts` would call "unknown"
 * (grab.careers is a smartrecruiters board; nothing in the URL says so).
 */
export function companyFromSeed(raw: CompanySeedEntry): NewCompany {
  const parsedAts = AtsKindSchema.safeParse(raw.ats);
  return CompanySchema.omit({ id: true }).parse({
    name: raw.company,
    type: raw.type,
    careersUrl: raw.careersUrl,
    ats: parsedAts.success ? parsedAts.data : "unknown",
    token: raw.token ?? null,
    confirmed: raw.confirmed ?? false,
    probedAt: raw.probed ?? null,
  });
}
