import { norm, type Application, type SourcedJob } from "../types";

/**
 * Cross-source job identity (DESIGN.md section 4, break #1 and #2).
 * sourced_jobs is unique per (user, source, external_id) only, so the same
 * role reached via Greenhouse and via Adzuna would land twice. Identity here
 * is the canonicalised URL when we have one, else normalised
 * company|title|location. Decision 10 resolved as: URL first, tuple fallback.
 */

/** Query params that carry attribution, not identity. */
const TRACKING_PARAMS = new Set(["gh_src", "lever-source", "ref", "source"]);

function isTracking(key: string): boolean {
  const k = key.toLowerCase();
  return k.startsWith("utm_") || TRACKING_PARAMS.has(k);
}

/**
 * Canonical form of a job URL: lowercase host, tracking params removed,
 * remaining params sorted, trailing slash and fragment dropped. Path case is
 * preserved (Lever/Ashby ids are case-sensitive). Unparseable input comes
 * back trimmed but otherwise untouched.
 */
export function canonicalJobUrl(url: string): string {
  const raw = url.trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !isTracking(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  const path = u.pathname.replace(/\/+$/, "");
  const port = u.port ? `:${u.port}` : "";
  return `${u.protocol}//${u.hostname.toLowerCase()}${port}${path}${query}`;
}

/** Identity key for cross-source dedupe. */
export function jobIdentity(job: SourcedJob): string {
  if (job.url) return canonicalJobUrl(job.url);
  return `${norm(job.company)}|${norm(job.title)}|${norm(job.location ?? "")}`;
}

/** Keep the first job seen per identity, preserving input order. */
export function dedupeJobs(jobs: SourcedJob[]): SourcedJob[] {
  const seen = new Set<string>();
  const out: SourcedJob[] = [];
  for (const j of jobs) {
    const key = jobIdentity(j);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(j);
  }
  return out;
}

/**
 * "Never resurface something already applied to" (SPEC M7): drop any job
 * whose company + title matches an application at ANY stage - saved through
 * closed. A lost application is still not something to surface again.
 */
export function excludeAlreadyInPipeline(jobs: SourcedJob[], applications: Application[]): SourcedJob[] {
  const inPipeline = new Set(applications.map((a) => `${norm(a.company)}|${norm(a.role)}`));
  return jobs.filter((j) => !inPipeline.has(`${norm(j.company)}|${norm(j.title)}`));
}
