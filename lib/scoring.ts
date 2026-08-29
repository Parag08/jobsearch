import { norm, type Contact, type SectorNode, type SourcedJob } from "./types";

const W_SECTOR_COMPANY = 30; // company already known in the sector node
const W_TITLE_SKILL = 30; // job title overlaps the user's evidenced skills (scaled)
const W_NETWORK = 30; // a contact works at the company
const W_LOCATION = 10; // job in a target path geography

/**
 * Score a sourced job 0-100 with zero generation tokens (token rule #2):
 * sector fit + skill overlap + network proximity + geography.
 */
export function scoreJob(
  job: SourcedJob,
  node: SectorNode,
  evidencedSkills: string[],
  contacts: Contact[],
): number {
  let score = 0;

  const companies = new Set(node.companies.map(norm));
  if (companies.has(norm(job.company))) score += W_SECTOR_COMPANY;

  const title = norm(job.title);
  const skills = evidencedSkills.map(norm);
  const titleHits = skills.filter((s) => title.includes(s)).length;
  if (skills.length) score += Math.min(1, titleHits / Math.min(skills.length, 3)) * W_TITLE_SKILL;

  const atCompany = contacts.some((c) => c.company !== null && norm(c.company) === norm(job.company));
  if (atCompany) score += W_NETWORK;

  const geo = node.path[node.path.length - 1];
  if (job.location && norm(job.location).includes(norm(geo))) score += W_LOCATION;

  return Math.max(0, Math.min(100, Math.round(score)));
}
