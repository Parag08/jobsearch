import { followupsDue } from "../outreach";
import { staleApplications } from "../pipeline";
import type { DbClient } from "../repos/db";
import { listApplications } from "../repos/applications";
import { saveBrief } from "../repos/briefs";
import { listContacts } from "../repos/contacts";
import { listSourcedJobs } from "../repos/sourced-jobs";
import type { Brief, BriefItem } from "../repos/rows";

export interface DailyBriefDeps {
  db: DbClient;
}

/** How many fresh sourced jobs make the brief. */
const TOP_SOURCED = 3;

/**
 * Daily brief (behind GET /api/brief): due follow-ups, stale applications,
 * and the top new sourced jobs - composed WITHOUT an LLM and persisted one
 * per (user, date), so regenerating overwrites.
 */
export async function generateBrief(
  { db }: DailyBriefDeps,
  userId: string,
  today: string,
): Promise<Brief> {
  const [contacts, applications, sourced] = await Promise.all([
    listContacts(db, userId),
    listApplications(db, userId),
    listSourcedJobs(db, userId, "new"),
  ]);

  const items: BriefItem[] = [
    ...followupsDue(contacts, today).map((c) => ({
      title: `Follow up with ${c.name}`,
      why: `follow-up due ${c.nextFollowup} (${c.warmth}${c.company ? `, ${c.company}` : ""})`,
      url: null,
    })),
    ...staleApplications(applications, today).map((a) => ({
      title: `Nudge ${a.company} - ${a.role}`,
      why: `applied ${a.appliedAt}, no response yet`,
      url: null,
    })),
    ...sourced.slice(0, TOP_SOURCED).map((j) => ({
      title: `Review sourced: ${j.title} @ ${j.company}`,
      why: `score ${j.score ?? "unscored"} from ${j.source}`,
      url: j.url,
    })),
  ];

  return saveBrief(db, userId, { date: today, items });
}
