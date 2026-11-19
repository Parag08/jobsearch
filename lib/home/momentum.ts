/**
 * Momentum: what the Home dashboard says about your search (DESIGN.md section 5, Home).
 *
 * A job search is mostly waiting and mostly no. What keeps people going is seeing their own
 * effort add up, and always knowing the next small thing to do. So this counts what YOU did
 * (applications sent, people reached, questions practised), never what the market did to
 * you; a closed application is a try, not a failure. Pure: the page passes the records and
 * today's date, and every target comes from the caller (env), never from here.
 */

export interface MomentumInput {
  /** YYYY-MM-DD, the viewer's today. */
  today: string;
  applications: { id: string; company: string; stage: string; savedAt: string; appliedAt: string | null }[];
  /** One date per logged conversation with a contact. */
  outreachDates: string[];
  /** One entry per mock interview attempt or case, with how long it took. */
  practice: { date: string; seconds: number }[];
  /** Watchlist roles found and not yet acted on. */
  openRoles: number;
  followupsDue: number;
  /** Applications with no reply past the stale threshold. */
  stale: number;
  /** Weekly targets; any left out has no target. */
  goals?: { apply?: number; reachOut?: number; practise?: number };
}

export type GoalKey = "apply" | "reachOut" | "practise";

export type Mood = "start" | "offer" | "interviews" | "goal-met" | "streak" | "quiet" | "moving";

export type NextKind = "follow-up" | "chase" | "send" | "add" | "roles" | "practise";

export interface NextStep {
  kind: NextKind;
  count: number;
  /** For "send": the oldest saved application, the one most likely to go stale. */
  applicationId?: string;
}

export interface Activity {
  key: GoalKey;
  /** Ever: applications sent, conversations logged, practice sessions. */
  total: number;
  week: number;
  /** This week's target, when the caller set one. */
  goal?: number;
  /** Consecutive days with this activity, ending today (or yesterday, until today is over). */
  streak: number;
  /** The last 14 days, oldest first. */
  days: { date: string; count: number }[];
}

export interface Momentum {
  /** Applied, reached out, practised: each with its own streak and totals. */
  activities: Activity[];
  /** All practice ever, in seconds. */
  practiceSeconds: number;
  week: { applied: number; reachedOut: number; practised: number };
  goals: { key: GoalKey; done: number; goal: number }[];
  /** Consecutive days with any activity, ending today (or yesterday, until today is over). */
  streak: number;
  /** The last 14 days, oldest first. */
  days: { date: string; count: number }[];
  /** Applications you have sent, ever: every one is a try, whatever happened next. */
  tries: number;
  /** Interviews and cases in play. */
  live: number;
  offers: number;
  mood: Mood;
  /** At most three, most urgent first. */
  next: NextStep[];
}

const STREAK_FOR_MOOD = 3;
const MAX_NEXT = 3;

/** YYYY-MM-DD shifted by whole days, in UTC so no timezone can move it. */
function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const day = (iso: string) => iso.slice(0, 10);

export function momentum(input: MomentumInput): Momentum {
  const { today, applications } = input;
  const weekStart = shift(today, -6);
  const inWeek = (d: string) => day(d) >= weekStart && day(d) <= today;

  const appliedDates = applications.flatMap((a) => (a.appliedAt ? [day(a.appliedAt)] : []));
  const practiceDates = input.practice.map((p) => day(p.date));
  const week = {
    applied: appliedDates.filter(inWeek).length,
    reachedOut: input.outreachDates.filter(inWeek).length,
    practised: practiceDates.filter(inWeek).length,
  };

  const goals: Momentum["goals"] = [];
  const g = input.goals ?? {};
  if (g.apply !== undefined) goals.push({ key: "apply", done: week.applied, goal: g.apply });
  if (g.reachOut !== undefined) goals.push({ key: "reachOut", done: week.reachedOut, goal: g.reachOut });
  if (g.practise !== undefined) goals.push({ key: "practise", done: week.practised, goal: g.practise });

  // Every dated thing you did, per day.
  const perDay = new Map<string, number>();
  const bump = (d: string) => perDay.set(day(d), (perDay.get(day(d)) ?? 0) + 1);
  appliedDates.forEach(bump);
  applications.forEach((a) => bump(a.savedAt));
  input.outreachDates.forEach(bump);
  practiceDates.forEach(bump);

  const fortnight = (counts: Map<string, number>) =>
    Array.from({ length: 14 }, (_, i) => {
      const date = shift(today, i - 13);
      return { date, count: counts.get(date) ?? 0 };
    });
  const runOf = (counts: Map<string, number>) => {
    let n = 0;
    let cursor = counts.has(today) ? today : shift(today, -1);
    while (counts.has(cursor)) {
      n += 1;
      cursor = shift(cursor, -1);
    }
    return n;
  };
  const tally = (dates: string[]) => {
    const m = new Map<string, number>();
    for (const d of dates) m.set(day(d), (m.get(day(d)) ?? 0) + 1);
    return m;
  };

  const days = fortnight(perDay);
  const streak = runOf(perDay);

  const activity = (key: GoalKey, dates: string[], weekCount: number, goal: number | undefined): Activity => {
    const counts = tally(dates);
    return { key, total: dates.length, week: weekCount, ...(goal !== undefined ? { goal } : {}), streak: runOf(counts), days: fortnight(counts) };
  };
  const activities = [
    activity("apply", appliedDates, week.applied, g.apply),
    activity("reachOut", input.outreachDates, week.reachedOut, g.reachOut),
    activity("practise", practiceDates, week.practised, g.practise),
  ];
  const practiceSeconds = input.practice.reduce((s, p) => s + p.seconds, 0);

  const tries = appliedDates.length;
  const live = applications.filter((a) => a.stage === "interview" || a.stage === "case").length;
  const offers = applications.filter((a) => a.stage === "offer" || a.stage === "negotiation").length;
  const activeThisWeek = days.slice(7).some((d) => d.count > 0);

  let mood: Mood;
  if (!applications.length && !input.outreachDates.length && !input.practice.length) mood = "start";
  else if (offers > 0) mood = "offer";
  else if (live > 0) mood = "interviews";
  else if (goals.some((x) => x.goal > 0 && x.done >= x.goal)) mood = "goal-met";
  else if (streak >= STREAK_FOR_MOOD) mood = "streak";
  else if (!activeThisWeek) mood = "quiet";
  else mood = "moving";

  const saved = applications.filter((a) => a.stage === "saved").sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  const next: NextStep[] = [];
  if (input.followupsDue > 0) next.push({ kind: "follow-up", count: input.followupsDue });
  if (input.stale > 0) next.push({ kind: "chase", count: input.stale });
  if (saved.length) next.push({ kind: "send", count: saved.length, applicationId: saved[0]!.id });
  if (!applications.length) next.push({ kind: "add", count: 0 });
  if (input.openRoles > 0) next.push({ kind: "roles", count: input.openRoles });
  next.push({ kind: "practise", count: 0 });

  return { activities, practiceSeconds, week, goals, streak, days, tries, live, offers, mood, next: next.slice(0, MAX_NEXT) };
}
