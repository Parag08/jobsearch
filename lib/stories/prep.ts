import type { Bullet, JdExtract } from "../types";
import { numberConsistency } from "./consistency";
import { storyGapReport, type StoryGapReport } from "./gap-report";
import { DEFAULT_VOCAB, type CompetencyVocab, type Story } from "./types";

export type StoryMatch = "bullet" | "project" | "none";

export interface PrepItem {
  bulletId: string;
  bullet: Bullet;
  /** Backing stories: pinned to this bullet if any, else the project's unpinned stories. */
  stories: Story[];
  matchedBy: StoryMatch;
  /** True when no story backs this line - the user must capture one; nothing is generated. */
  needsStory: boolean;
  /** Per backing story, bullet numbers the story never states (empty entries omitted). */
  numberIssues: { storyId: string; unmatched: string[] }[];
}

export interface PrepSet {
  /** One entry per bullet on the sent CV, in CV order. */
  items: PrepItem[];
  /** Bullet ids on the CV that the bank no longer holds (a resync casualty; surface, don't hide). */
  unknownBulletIds: string[];
  /** Which demanded competencies the story bank covers, and which it does not. */
  gaps: StoryGapReport;
}

/**
 * Interview prep scoped to the exact page the interviewer read: the bullet ids stored on
 * the application CV, resolved against the bank, each paired with the stories the user has
 * already told. Never generates text - a bullet without a story is flagged, not filled.
 *
 * Story attachment: stories pinned to the bullet (`bulletId`) win; otherwise the project's
 * stories not pinned to some other bullet are offered as raw material.
 */
export function prepSet(
  applicationCvBulletIds: string[],
  bank: Record<string, Bullet>,
  stories: Story[],
  jd: JdExtract,
  vocab: CompetencyVocab = DEFAULT_VOCAB,
): PrepSet {
  const items: PrepItem[] = [];
  const unknownBulletIds: string[] = [];

  for (const bulletId of applicationCvBulletIds) {
    const bullet = bank[bulletId];
    if (!bullet) {
      unknownBulletIds.push(bulletId);
      continue;
    }
    let matchedBy: StoryMatch = "bullet";
    let backing = stories.filter((s) => s.bulletId === bulletId);
    if (backing.length === 0) {
      backing = stories.filter((s) => s.projectId === bullet.projectId && s.bulletId === null);
      matchedBy = backing.length > 0 ? "project" : "none";
    }
    const numberIssues = backing
      .map((s) => ({ storyId: s.id, unmatched: numberConsistency(s, bullet).unmatched }))
      .filter((i) => i.unmatched.length > 0);
    items.push({ bulletId, bullet, stories: backing, matchedBy, needsStory: backing.length === 0, numberIssues });
  }

  return { items, unknownBulletIds, gaps: storyGapReport(jd, stories, vocab) };
}
