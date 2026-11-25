import { norm } from "../types";
import { companyWebsite, DEFAULT_DAILY_TARGET, type Decision, type SourcingRecipe } from "../watchlist/daily";
import { detectAts } from "../watchlist/ats";
import { Evidence, RankReview, type EvidenceCode } from "../watchlist/safe-kit";
import { parseTargetList } from "../watchlist/targets";
import { listCompanies } from "./companies";
import { many, one, oneOrNull, type DbClient } from "./db";
import { addWatchlistEntry } from "./watchlist";
import type { SourcingCompanyRow } from "./rows";

export async function getSourcingRecipe(db: DbClient, userId: string): Promise<SourcingRecipe> {
  const row = await oneOrNull(db.from("profiles").select("daily_sourcing_target,target_geos,target_titles,excluded_titles")
    .eq("user_id", userId).maybeSingle(), "profiles", "sourcing recipe");
  return { target: row?.daily_sourcing_target ?? DEFAULT_DAILY_TARGET,
    cities: row?.target_geos ?? [], titles: row?.target_titles ?? [], excluded: row?.excluded_titles ?? [] };
}

export async function putSourcingRecipe(db: DbClient, userId: string, recipe: SourcingRecipe) {
  await one(db.from("profiles").update({
    daily_sourcing_target: recipe.target, target_geos: recipe.cities,
    target_titles: recipe.titles, excluded_titles: recipe.excluded,
  }).eq("user_id", userId).select().single(), "profiles", "save sourcing recipe");
}

export function sourcingTerms(raw: string): string[] | null {
  const terms = parseTargetList(raw);
  return raw.length <= 2000 && terms.length <= 30 &&
    terms.every((t) => /^[\p{L}\p{M} .()&+/-]{1,100}$/u.test(t)) ? terms : null;
}

export function listSourcingCompanies(db: DbClient, userId: string) {
  return many(db.from("sourcing_companies").select().eq("user_id", userId).order("name"), "sourcing_companies", "list");
}

export function getSourcingCompany(db: DbClient, userId: string, id: string) {
  return oneOrNull(db.from("sourcing_companies").select().eq("user_id", userId).eq("id", id).maybeSingle(),
    "sourcing_companies", "get");
}

export function publicCompanyName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return /^(?=.{1,160}$)(?=.*\p{L})[\p{L}\p{M}\p{N} .&'’()+,-]+$/u.test(name) && !/\d{4,}/.test(name) ? name : null;
}

export async function addSourcingCompany(db: DbClient, userId: string, rawName: string, rawWebsite: string, date: string) {
  const name = publicCompanyName(rawName);
  if (!name) return { error: "Enter an organization name (no personal details)." } as const;
  const website = rawWebsite.trim() ? companyWebsite(rawWebsite.trim()) : null;
  if (rawWebsite.trim() && !website) return { error: "Enter a public HTTPS company website." } as const;
  const identity = norm(name);
  const companies = await listSourcingCompanies(db, userId);
  const byName = companies.find((c) => c.identity === identity);
  const byWebsite = website ? companies.find((c) => c.website === website) : undefined;
  if (byName && byWebsite && byName.id !== byWebsite.id) return { error: "That website belongs to another target." } as const;
  const existing = byName ?? byWebsite;
  if (existing?.active) return { error: "This company is already a target." } as const;
  if (existing?.website && website && existing.website !== website) return { error: "The name belongs to a target with a different website." } as const;
  const company = existing ?? await one(db.from("sourcing_companies").insert({
    user_id: userId, name, identity, website, active: false, research: [], research_version: 0, research_requested: false,
  }).select().single(), "sourcing_companies", "add");
  const verified = (await listCompanies(db)).find((c) => norm(c.name) === company.identity && c.confirmed && c.ats !== "unknown" && c.token);
  if (verified) {
    await addWatchlistEntry(db, userId, {
      company: company.name, companyId: company.id, careersUrl: verified.careersUrl, ats: verified.ats,
      token: verified.token, active: true, addedAt: date,
    });
  }
  if (existing && !existing.website && website) await setCompanyWebsite(db, userId, existing.id, website);
  return { company: await setSourcingCompanyActive(db, userId, company.id, true) } as const;
}

export async function setCompanyWebsite(db: DbClient, userId: string, id: string, raw: string) {
  const website = companyWebsite(raw.trim());
  if (!website) return false;
  const company = await oneOrNull(db.from("sourcing_companies").update({ website })
    .eq("user_id", userId).eq("id", id).is("website", null).select().maybeSingle(), "sourcing_companies", "add website");
  return Boolean(company);
}

export async function setSourcingCompanyActive(db: DbClient, userId: string, id: string, active: boolean) {
  const company = await one(db.from("sourcing_companies").update({ active }).eq("user_id", userId).eq("id", id)
    .select().single(), "sourcing_companies", "set target");
  if (!active) {
    const jobs = await many(db.from("sourced_jobs").select().eq("user_id", userId).eq("company_id", id),
      "sourced_jobs", "find company picks");
    for (const job of jobs.filter((j) => j.sourcing_decision === "picked" || (!j.sourcing_decision && j.status === "shortlisted"))) {
      await setSourcingDecision(db, userId, job.id, "available");
    }
  }
  return company;
}

export async function connectSourcingBoard(db: DbClient, userId: string, company: SourcingCompanyRow, raw: string, date: string) {
  const board = detectAts(raw.trim());
  if (board.ats === "unknown" || !board.token || !/^[a-z0-9_-]{1,100}$/i.test(board.token) ||
    !companyWebsite(raw.trim())) return false;
  const url = new URL(raw.includes("://") ? raw.trim() : "https://" + raw.trim());
  await addWatchlistEntry(db, userId, { company: company.name, companyId: company.id,
    careersUrl: url.origin + "/" + board.token, ats: board.ats, token: board.token, active: true, addedAt: date });
  return true;
}

export async function getSafeEvidence(db: DbClient, userId: string): Promise<EvidenceCode[]> {
  const profile = await oneOrNull(db.from("profiles").select("sourcing_evidence").eq("user_id", userId).maybeSingle(), "profiles", "safe evidence");
  return Evidence.options.filter((code) => profile?.sourcing_evidence?.includes(code));
}

export async function putSafeEvidence(db: DbClient, userId: string, evidence: EvidenceCode[]) {
  await one(db.from("profiles").update({ sourcing_evidence: Evidence.options.filter((c) => evidence.includes(c)) })
    .eq("user_id", userId).select().single(), "profiles", "save safe evidence");
}

export async function getSourcingTriage(db: DbClient, userId: string) {
  const [jobs, evidence] = await Promise.all([
    many(db.from("sourced_jobs").select("id,sourcing_decision,sourcing_review").eq("user_id", userId), "sourced_jobs", "triage"),
    getSafeEvidence(db, userId),
  ]);
  return {
    decisions: Object.fromEntries(jobs.flatMap((j) => j.sourcing_decision ? [[j.id, j.sourcing_decision]] : [])) as Record<string, Decision | "available">,
    reviews: Object.fromEntries(jobs.flatMap((j) => {
      const r = RankReview.safeParse(j.sourcing_review);
      return r.success && r.data.evidence.every((code) => evidence.includes(code)) ? [[j.id, r.data] as const] : [];
    })),
    evidence,
  };
}

export async function setSourcingDecision(db: DbClient, userId: string, id: string, decision: Decision | "available") {
  await one(db.from("sourced_jobs").update({ sourcing_decision: decision }).eq("user_id", userId).eq("id", id)
    .select().single(), "sourced_jobs", "triage");
}
