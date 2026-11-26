import { listApplications } from "../repos/applications";
import type { DbClient } from "../repos/db";
import { listSourcedJobs } from "../repos/sourced-jobs";
import { getSourcingRecipe, getSourcingTriage, listSourcingCompanies } from "../repos/sourcing";
import { listWatchlist } from "../repos/watchlist";
import { norm, type SourcedJob } from "../types";
import { dailyShortlist } from "../watchlist/daily";
import type { WatchlistEntry } from "../watchlist/types";

export function boardForRole(boards: WatchlistEntry[], role: SourcedJob) {
  return role.sourcingBoardUrl
    ? boards.find((board) => board.careersUrl === role.sourcingBoardUrl)
    : boards.find((board) => board.ats === role.source && norm(board.company) === norm(role.company));
}

export async function loadDailySourcing(db: DbClient, userId: string) {
  const [companies, boards, jobs, apps, triage, recipe] = await Promise.all([
    listSourcingCompanies(db, userId), listWatchlist(db, userId, { active: true }), listSourcedJobs(db, userId),
    listApplications(db, userId), getSourcingTriage(db, userId), getSourcingRecipe(db, userId),
  ]);
  const companiesById = new Map(companies.map((c) => [c.id, c]));
  const companyByName = new Map(companies.map((c) => [norm(c.name), c]));
  const configured = boards.filter((b) => b.ats !== "unknown" && b.token &&
    (b.companyId ? companiesById.get(b.companyId) : companyByName.get(norm(b.company)))?.active);
  const boardUrls = new Set(configured.map((board) => board.careersUrl));
  const currentJobs = jobs.filter((job) => !job.sourcingBoardUrl || boardUrls.has(job.sourcingBoardUrl));
  const shortlist = dailyShortlist(currentJobs, companies, apps, triage.decisions, recipe, triage.reviews);
  const rankedIds = new Set(shortlist.ranked.map((job) => job.id));
  const rankedRoles = [...shortlist.ranked, ...shortlist.picked.filter((job) => !rankedIds.has(job.id))];
  return { ...shortlist, rankedRoles,
    companies, configured, apps, companyByName, recipe, reviews: triage.reviews, evidence: triage.evidence };
}
