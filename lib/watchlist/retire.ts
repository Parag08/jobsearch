import { norm, type SourcedJob } from "../types";

/**
 * Retiring roles that close (ROADMAP Now #1). A posting that is missing from a
 * board that DID answer, on this many consecutive refreshes, is marked `closed`.
 * Two, not one: boards sometimes drop a role for a day while it is edited.
 */
export const RETIRE_AFTER_MISSES = 2;

export interface TrackedJob {
  id: string;
  source: string;
  externalId: string | null;
  company: string;
  status: SourcedJob["status"];
  missedRefreshes: number;
}

export interface SeenPosting {
  source: string;
  externalId: string | null;
}

/** A board that answered this refresh: its ATS and the company it belongs to. */
export interface AnsweredBoard {
  source: string;
  company: string;
}

export interface RetirementUpdate {
  id: string;
  missedRefreshes: number;
  status: SourcedJob["status"];
}

/** Statuses a refresh may change. `tracked` and `dismissed` are the user's decisions. */
const MANAGED: ReadonlySet<SourcedJob["status"]> = new Set(["new", "shortlisted", "closed"]);

const boardKey = (source: string, company: string) => `${source}|${norm(company)}`;
const postingKey = (source: string, externalId: string) => `${source}|${externalId}`;

/**
 * Pure: which stored rows change after a refresh. Seen rows reset their miss
 * count (a closed one returns as `new`); unseen rows from an answered board
 * count a miss and close at RETIRE_AFTER_MISSES. Rows whose board failed, rows
 * from other feeds, and unchanged rows produce no update.
 */
export function planRetirement(
  existing: readonly TrackedJob[],
  seen: readonly SeenPosting[],
  answered: readonly AnsweredBoard[],
): RetirementUpdate[] {
  const boards = new Set(answered.map((b) => boardKey(b.source, b.company)));
  const seenKeys = new Set(
    seen.filter((s) => s.externalId !== null).map((s) => postingKey(s.source, s.externalId as string)),
  );
  const updates: RetirementUpdate[] = [];

  for (const row of existing) {
    if (!MANAGED.has(row.status) || row.externalId === null) continue;
    if (!boards.has(boardKey(row.source, row.company))) continue;

    if (seenKeys.has(postingKey(row.source, row.externalId))) {
      const status = row.status === "closed" ? "new" : row.status;
      if (row.missedRefreshes !== 0 || status !== row.status) {
        updates.push({ id: row.id, missedRefreshes: 0, status });
      }
      continue;
    }

    if (row.status === "closed") continue;
    const missedRefreshes = row.missedRefreshes + 1;
    updates.push({
      id: row.id,
      missedRefreshes,
      status: missedRefreshes >= RETIRE_AFTER_MISSES ? "closed" : row.status,
    });
  }
  return updates;
}
