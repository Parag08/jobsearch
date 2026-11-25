import { norm, type Application, type SourcedJob } from "../types";
import { ATS_KINDS } from "./ats";
import { canonicalJobUrl, dedupeJobs } from "./identity";
import { filterToTargets } from "./targets";

export const DEFAULT_DAILY_TARGET = 20;
export type Decision = "picked" | "later" | "dismissed";

export interface SourcingRecipe {
  target: number;
  cities: string[];
  titles: string[];
  excluded: string[];
}

export function parseDailyTarget(raw: string): number | null {
  const target = Number(raw);
  return /^\d+$/.test(raw) && target >= 1 && target <= 2_147_483_647 ? target : null;
}

export function companyWebsite(raw: string): string | null {
  try {
    const url = new URL(raw.includes("://") ? raw : "https://" + raw);
    const host = url.hostname.replace(/^www\./, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(host) ||
      /\.(?:local|localhost|internal|test|invalid|example)$/.test(host)) return null;
    return "https://" + host;
  } catch {
    return null;
  }
}

export function safePostingUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!companyWebsite(raw) || url.pathname.length > 400 || !/^\/[a-z0-9/_-]*$/i.test(url.pathname)) return null;
    const id = url.searchParams.get("gh_jid");
    url.search = id && /^\d{1,16}$/.test(id) ? "?gh_jid=" + id : "";
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export function safeRoleLabel(text: string | null, location = false) {
  if (!text || !/^[\p{L}\p{M}\p{N} .,'’()/+&–-]{1,250}$/u.test(text)) return null;
  if (/\d{4,}/.test(text) || (location && /\d/.test(text))) return null;
  return text;
}

export function dailyShortlist(
  jobs: SourcedJob[],
  companies: { name: string; active: boolean }[],
  applications: Pick<Application, "company" | "role" | "externalRef" | "applyUrl">[],
  decisions: Readonly<Record<string, Decision | "available">>,
  recipe: SourcingRecipe,
  reviews: Readonly<Record<string, { evidence: readonly string[] }>> = {},
) {
  const targets = new Set(companies.filter((c) => c.active).map((c) => norm(c.name)));
  const refs = new Set(applications.flatMap((a) => a.externalRef ? [a.externalRef] : []));
  const urls = new Set(applications.flatMap((a) => {
    const url = safePostingUrl(a.applyUrl ?? null);
    return url ? [canonicalJobUrl(url)] : [];
  }));
  const legacyRoles = new Set(applications.filter((a) => !a.externalRef?.startsWith("sourced:"))
    .map((a) => JSON.stringify([norm(a.company), norm(a.role)])));
  const eligible = filterToTargets(jobs.map((job) => ({
    ...job, location: safeRoleLabel(job.location, true), url: safePostingUrl(job.url),
  })).filter((job) =>
    (ATS_KINDS.slice(0, -1) as readonly string[]).includes(job.source) && targets.has(norm(job.company)) &&
    safeRoleLabel(job.title) && (!job.url || !urls.has(canonicalJobUrl(job.url))) &&
    job.status !== "tracked" && job.status !== "closed" && !refs.has("sourced:" + job.id) &&
    !legacyRoles.has(JSON.stringify([norm(job.company), norm(job.title)]))),
  { geos: recipe.cities, titles: recipe.titles, excludedTitles: recipe.excluded });
  const decision = (job: SourcedJob) => decisions[job.id] === "available" ? null :
    decisions[job.id] ?? (job.status === "dismissed" ? "dismissed" : null);
  const byFreshness = (a: SourcedJob, b: SourcedJob) =>
    (b.postedAt ?? "").localeCompare(a.postedAt ?? "") || a.id.localeCompare(b.id);
  const byPriority = (a: SourcedJob, b: SourcedJob) =>
    (reviews[b.id]?.evidence.length ?? 0) - (reviews[a.id]?.evidence.length ?? 0) || byFreshness(a, b);
  const sorted = dedupeJobs(eligible.sort((a, b) => Number(Boolean(decision(b))) - Number(Boolean(decision(a))) || byPriority(a, b))).sort(byPriority);
  const available = sorted.filter((job) => !decision(job) || decision(job) === "picked");
  return {
    ranked: available.slice(0, recipe.target),
    available,
    picked: sorted.filter((job) => decision(job) === "picked"),
    later: sorted.filter((job) => decision(job) === "later"),
    dismissed: sorted.filter((job) => decision(job) === "dismissed"),
  };
}
