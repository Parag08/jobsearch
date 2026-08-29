import type { SourcedJob } from "../types";

/** Raw Adzuna /jobs/{country}/search result item (subset we use). */
export interface AdzunaResult {
  id?: string | number;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url?: string;
  created?: string;
}

/** Map one Adzuna result into a SourcedJob. Pure and total: missing fields degrade gracefully. */
export function mapAdzunaResult(raw: AdzunaResult): SourcedJob {
  const externalId = raw.id != null ? String(raw.id) : null;
  return {
    id: `adzuna-${externalId ?? cryptoRandom()}`,
    source: "adzuna",
    externalId,
    title: raw.title ?? "",
    company: raw.company?.display_name ?? "",
    location: raw.location?.display_name ?? null,
    url: raw.redirect_url ?? null,
    postedAt: raw.created ? raw.created.slice(0, 10) : null,
    score: null,
    status: "new",
  };
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 10);
}
