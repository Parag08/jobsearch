/**
 * ATS detection for the watchlist (DESIGN.md section 4): the user pastes a
 * careers-page URL and we derive which applicant-tracking system hosts the
 * board and its board token, so postings can be pulled from the ATS's free,
 * keyless public JSON endpoint. Anything we cannot derive is "unknown" -
 * the signal for a manual fallback (user supplies ATS + token by hand).
 */

export const ATS_KINDS = ["greenhouse", "lever", "ashby", "smartrecruiters", "unknown"] as const;
export type AtsKind = (typeof ATS_KINDS)[number];

export interface AtsDetection {
  ats: AtsKind;
  /** Board token / company slug as it appears in the careers URL. */
  token: string | null;
  /** Public JSON endpoint listing open postings, or null when unknown. */
  endpoint: string | null;
}

const UNKNOWN: AtsDetection = { ats: "unknown", token: null, endpoint: null };

/** Host -> ATS kind. Exact hostname match only (no substring tricks). */
const HOSTS: Record<string, Exclude<AtsKind, "unknown">> = {
  "boards.greenhouse.io": "greenhouse",
  "job-boards.greenhouse.io": "greenhouse",
  "jobs.lever.co": "lever",
  "jobs.ashbyhq.com": "ashby",
  "careers.smartrecruiters.com": "smartrecruiters",
};

/** Build the public postings endpoint for a detected ATS + token. */
export function atsEndpoint(ats: Exclude<AtsKind, "unknown">, token: string): string {
  const t = encodeURIComponent(token);
  switch (ats) {
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`;
    case "lever":
      return `https://api.lever.co/v0/postings/${t}?mode=json`;
    case "ashby":
      return `https://api.ashbyhq.com/posting-api/job-board/${t}`;
    case "smartrecruiters":
      return `https://api.smartrecruiters.com/v1/companies/${t}/postings`;
  }
}

/** Derive ATS, board token and public endpoint from a careers-page URL. Pure and total. */
export function detectAts(careersUrl: string): AtsDetection {
  const url = parse(careersUrl);
  if (!url) return UNKNOWN;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const ats = HOSTS[host];
  if (!ats) return UNKNOWN;

  // The board token is always the first path segment; deeper segments are a job link.
  const token = url.pathname.split("/").filter(Boolean)[0];
  if (!token) return UNKNOWN;

  return { ats, token, endpoint: atsEndpoint(ats, token) };
}

function parse(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes(".") ? u : null;
  } catch {
    return null;
  }
}
