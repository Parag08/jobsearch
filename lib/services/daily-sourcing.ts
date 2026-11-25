import { listApplications } from "../repos/applications";
import type { DbClient } from "../repos/db";
import { listSourcedJobs } from "../repos/sourced-jobs";
import { getSourcingRecipe, getSourcingTriage, listSourcingCompanies } from "../repos/sourcing";
import { listWatchlist } from "../repos/watchlist";
import { norm } from "../types";
import { dailyShortlist } from "../watchlist/daily";

export async function loadDailySourcing(db: DbClient, userId: string) {
  const [companies, boards, jobs, apps, triage, recipe] = await Promise.all([
    listSourcingCompanies(db, userId), listWatchlist(db, userId, { active: true }), listSourcedJobs(db, userId),
    listApplications(db, userId), getSourcingTriage(db, userId), getSourcingRecipe(db, userId),
  ]);
  const companiesById = new Map(companies.map((c) => [c.id, c]));
  const companyByName = new Map(companies.map((c) => [norm(c.name), c]));
  const configured = boards.filter((b) => b.ats !== "unknown" && b.token &&
    (b.companyId ? companiesById.get(b.companyId) : companyByName.get(norm(b.company)))?.active);
  return { ...dailyShortlist(jobs, companies, apps, triage.decisions, recipe, triage.reviews),
    companies, configured, apps, companyByName, recipe, reviews: triage.reviews, evidence: triage.evidence };
}
