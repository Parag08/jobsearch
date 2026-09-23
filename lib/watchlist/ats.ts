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

// ---- board ownership --------------------------------------------------------------

/**
 * A board token that RETURNS postings is not evidence the board belongs to the
 * company. The 2026-09-23 probe run found four confident false positives, all
 * answering with real current jobs: `mas` is an HVAC firm in Illinois, `edb` is
 * EnterpriseDB, `sia` is Sia Partners and `bcg` is somebody's test board. Nothing
 * downstream would have caught them, because every later stage trusts the source.
 */

/** What a fetched board reveals about who owns it. Both fields are often absent. */
export interface BoardProof {
  /** Employer name the board reports (SmartRecruiters provides one; others do not). */
  boardName?: string | null;
  /** A job or apply URL from the board, which often carries the employer's domain. */
  jobUrl?: string | null;
}

/** Which signal accepted a board, or null when none did. */
export type Corroboration = "board-name" | "employer-domain" | "token-name" | null;

/** Names the length ratio below which an overlap is a fragment, not a match. */
const NAME_RATIO = 0.6;
/** Below this, a token is too short to stand on its own ("mas", "edb", "sia", "bcg"). */
const MIN_LONE_TOKEN = 5;

const alnum = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Registrable domain, keeping multi-part public suffixes intact so `tech.gov.sg`
 * does not collapse to `gov.sg` and match every Singapore government site.
 */
export function registrableDomain(raw: string): string | null {
  try {
    const host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
    const parts = host.split(".");
    if (parts.length < 2) return null;
    const twoPartSuffix = /^(gov|com|co|org|net|edu|ac)$/.test(parts[parts.length - 2] ?? "");
    return parts.slice(twoPartSuffix ? -3 : -2).join(".");
  } catch {
    return null;
  }
}

/**
 * Does this board belong to this company? Returns the signal that accepted it, or
 * null to reject.
 *
 * Deliberately strict, and it produces false negatives as well as catching frauds:
 * `lever/nium` is genuinely Nium, but only its subsidiary's name inside the posting
 * text says so, and that is not in the payload. Prefer the false negative - a missed
 * company gets a manual check, a false positive silently poisons everything
 * downstream. The seed file's `confirmed: true` is the escape hatch.
 */
export function corroborateBoard(
  company: string,
  careersUrl: string,
  token: string,
  proof: BoardProof,
): Corroboration {
  const want = alnum(company);
  const got = alnum(proof.boardName);

  if (got && want) {
    // Containment alone is how "Sia" passes for "SIA Engineering"; demand the two
    // names also be comparable in length.
    const overlaps = got.includes(want) || want.includes(got);
    const ratio = Math.min(got.length, want.length) / Math.max(got.length, want.length);
    if (overlaps && ratio >= NAME_RATIO) return "board-name";
  }

  const careers = registrableDomain(careersUrl);
  const job = proof.jobUrl ? registrableDomain(proof.jobUrl) : null;
  if (careers && job && careers === job) return "employer-domain";

  if (token.length >= MIN_LONE_TOKEN && want && (want === token || want.startsWith(token) || token.startsWith(want))) {
    return "token-name";
  }
  return null;
}
