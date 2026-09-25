import type { SourcedJob } from "../types";

/**
 * Which sourced roles a user wants to see (DESIGN.md section 4). Without this a
 * watched board floods the list: one large company alone posts hundreds of
 * roles in every city. The lists are the user's own DATA (profile columns
 * target_geos / target_titles / excluded_titles) - nothing here knows a city or
 * a job title (CLAUDE.md rule 4).
 */
export interface JobTargets {
  /** Cities or countries; a posting must list one of them. */
  geos: string[];
  /** Title phrases; a posting's title must contain one, as whole words. */
  titles: string[];
  /** Title phrases that rule a posting out even when it matches a target. */
  excludedTitles: string[];
}

/** Lowercase words separated by single spaces: "PRODUCT  Manager (AI)" -> "product manager ai". */
function words(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function phrases(list: string[]): string[] {
  return list.map(words).filter(Boolean);
}

/** True when `phrase` appears in `text` as whole words ("intern" is not in "internal"). */
function containsPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

export function hasTargets(t: JobTargets): boolean {
  return phrases(t.geos).length > 0 || phrases(t.titles).length > 0 || phrases(t.excludedTitles).length > 0;
}

/**
 * A dimension the user has not declared filters nothing, so a new user still
 * sees their boards; once declared, a posting must satisfy it.
 */
export function matchesTargets(job: Pick<SourcedJob, "title" | "location">, t: JobTargets): boolean {
  const geos = phrases(t.geos);
  if (geos.length > 0) {
    const where = words(job.location ?? "");
    if (!geos.some((g) => containsPhrase(where, g))) return false;
  }

  const title = words(job.title);
  if (phrases(t.excludedTitles).some((x) => containsPhrase(title, x))) return false;

  const wanted = phrases(t.titles);
  return wanted.length === 0 || wanted.some((w) => containsPhrase(title, w));
}

export function filterToTargets<J extends Pick<SourcedJob, "title" | "location">>(jobs: J[], t: JobTargets): J[] {
  return jobs.filter((j) => matchesTargets(j, t));
}

/** Typed list -> clean list: split on commas and new lines, trim, drop blanks and repeats (case-insensitive). */
export function parseTargetList(text: string): string[] {
  const seen = new Map<string, string>();
  for (const part of text.split(/[,\n]/)) {
    const v = part.trim();
    const k = words(v);
    if (k && !seen.has(k)) seen.set(k, v);
  }
  return [...seen.values()];
}
