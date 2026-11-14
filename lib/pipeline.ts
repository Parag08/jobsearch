import { STAGES, type Application, type ClosedReason, type Stage } from "./types";

export const STALE_AFTER_DAYS = 14;

/** Any move between open stages is allowed (forward or back); closed is terminal. */
export function canTransition(from: Stage, to: Stage): boolean {
  if (from === "closed") return false;
  if (from === to) return false;
  return STAGES.includes(to);
}

/** Advance an application. Immutable. Stamps appliedAt once; closing requires a reason. */
export function advance(
  app: Application,
  to: Stage,
  onDate: string,
  closedReason?: ClosedReason,
): Application {
  if (!canTransition(app.stage, to)) {
    throw new Error(`Illegal transition ${app.stage} -> ${to}`);
  }
  if (to === "closed" && !closedReason) {
    throw new Error("Closing an application requires a closedReason");
  }
  return {
    ...app,
    stage: to,
    closedReason: to === "closed" ? (closedReason as ClosedReason) : app.closedReason,
    appliedAt: to === "applied" && !app.appliedAt ? onDate : app.appliedAt,
    updatedAt: onDate,
  };
}

function daysBetween(a: string, b: string): number {
  return Math.floor((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** Applications sitting in "applied" with no response for >= STALE_AFTER_DAYS. */
export function staleApplications(apps: Application[], today: string): Application[] {
  return apps.filter(
    (a) => a.stage === "applied" && a.appliedAt !== null && daysBetween(a.appliedAt, today) >= STALE_AFTER_DAYS,
  );
}

/**
 * Applications with any activity in the last `days` days: applied to, moved, or saved.
 * The board shows these by default so a long history does not bury this week's work.
 * `days` comes from config (lib/pipeline-settings.ts), never a constant here.
 */
export function recentApplications(apps: Application[], today: string, days: number): Application[] {
  const within = (date: string | null) => date !== null && daysBetween(date.slice(0, 10), today) <= days;
  return apps.filter((a) => within(a.appliedAt) || within(a.updatedAt) || within(a.savedAt));
}

export interface FunnelStats {
  byStage: Record<Stage, number>;
  applied: number;
  responseRate: number; // share of applied that progressed past "applied"
}

export function funnelStats(apps: Application[]): FunnelStats {
  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  for (const a of apps) byStage[a.stage] += 1;
  const everApplied = apps.filter((a) => a.appliedAt !== null);
  const progressed = everApplied.filter((a) => a.stage !== "applied");
  return {
    byStage,
    applied: everApplied.length,
    responseRate: everApplied.length ? progressed.length / everApplied.length : 0,
  };
}
