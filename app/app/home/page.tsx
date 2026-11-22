import Link from "next/link";
import { envFor } from "@/lib/services/settings";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listApplications } from "@/lib/repos/applications";
import { listContacts, listInteractionDates } from "@/lib/repos/contacts";
import { listAttempts } from "@/lib/repos/answers";
import { listCaseSessions } from "@/lib/repos/case-sessions";
import { listSourcedJobs } from "@/lib/repos/sourced-jobs";
import { listProjects } from "@/lib/repos/projects";
import { staleApplications } from "@/lib/pipeline";
import { followupsDue } from "@/lib/outreach";
import { needsMetric } from "@/lib/onboarding";
import { momentum, type Activity, type Momentum, type NextStep, type GoalKey } from "@/lib/home/momentum";
import { homeGoalsFromEnv } from "@/lib/home/settings";
import { getProfile } from "@/lib/repos/profiles";
import { roleFamilies, roleInsights } from "@/lib/insights/role-insights";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/insights/display";
import { attemptSeconds, caseSeconds } from "@/lib/home/practice-time";
import { familyLabel, toneFor } from "@/lib/pipeline-display";
import ui from "../ui.module.css";

/**
 * The overview, opened from the JobSearch name in the menu bar (DESIGN.md section 5,
 * Overview). Two tabs: Progress (what you did - a streak, a total and a fortnight for each
 * of applying, reaching out and practising - plus the next step) and Insights (what the
 * roles you collected ask for, and how well your experience covers it). It counts what you
 * did, never what the market did to you; the button under the headline is the one action.
 */
export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function headline(m: Momentum): { title: string; body: string } {
  const week = `This week: ${plural(m.week.applied, "application")} sent, ${plural(m.week.reachedOut, "conversation")}, ${plural(m.week.practised, "practice run")}.`;
  switch (m.mood) {
    case "start":
      return { title: "Your search starts with one job.", body: "Paste a posting and JobSearch builds the application around your own experience." };
    case "offer":
      return { title: m.offers === 1 ? "You have an offer on the table." : `You have ${m.offers} offers on the table.`, body: "Every application before it got you here. Weigh it carefully, and negotiate." };
    case "interviews":
      return { title: `${plural(m.live, "interview")} in play.`, body: "Practice is the part you control. One story out loud today makes the next round easier." };
    case "goal-met":
      return { title: "You hit this week's goal.", body: `${week} Steady weeks win searches. Keep the run going.` };
    case "streak":
      return { title: `${m.streak} days in a row.`, body: `${week} Small steps every day add up faster than big bursts.` };
    case "quiet":
      return { title: "A quiet week. One action restarts it.", body: "Send one application or one message today. Momentum comes back faster than it feels." };
    default:
      return { title: "You're moving.", body: week };
  }
}

function stepCopy(n: NextStep, savedCompany: string | undefined): { text: string; href: string } {
  switch (n.kind) {
    case "follow-up":
      return { text: `Follow up with ${plural(n.count, "person", "people")}`, href: "/app/network" };
    case "chase":
      return { text: `Chase ${plural(n.count, "application")} with no reply`, href: "/app" };
    case "send":
      return {
        text: n.count === 1 ? `Send your saved application${savedCompany ? ` to ${savedCompany}` : ""}` : `Send one of your ${n.count} saved applications${savedCompany ? `, starting with ${savedCompany}` : ""}`,
        href: `/app/applications/${n.applicationId}`,
      };
    case "add":
      return { text: "Add your first job", href: "/app" };
    case "roles":
      return { text: `Look at ${plural(n.count, "new role")} on your watchlist`, href: "/app/watchlist" };
    default:
      return { text: "Practise one question out loud", href: "/app/interview" };
  }
}

const ACTIVITY: Record<GoalKey, { name: string; unit: (n: number) => string; tone: string }> = {
  apply: { name: "Jobs applied", unit: (n) => plural(n, "application"), tone: "var(--accent)" },
  reachOut: { name: "People reached", unit: (n) => plural(n, "conversation"), tone: "var(--stage-case)" },
  practise: { name: "Practice", unit: (n) => plural(n, "session"), tone: "var(--warm)" },
};

function duration(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** One activity: its streak, its last 14 days, its total and this week against the goal. */
function ActivityCard({ a, practiceSeconds }: { a: Activity; practiceSeconds: number }) {
  const meta = ACTIVITY[a.key];
  const active = a.days.filter((d) => d.count).length;
  return (
    <div className={ui.activity} style={{ "--tone": meta.tone } as React.CSSProperties}>
      <span className={ui.reportName}>{meta.name}</span>
      <b className={ui.activityStreak}>{a.streak ? `${plural(a.streak, "day")} streak` : "No streak yet"}</b>
      <div className={ui.days} role="img" aria-label={`${meta.name}: active on ${active} of the last 14 days`}>
        {a.days.map((d) => (
          <i key={d.date} data-on={d.count ? "" : undefined} title={`${d.date}: ${d.count}`} />
        ))}
      </div>
      <dl className={ui.activityStats}>
        <div>
          <dt>Total</dt>
          <dd>{a.key === "practise" ? duration(practiceSeconds) : a.total}</dd>
        </div>
        {a.key === "practise" && (
          <div>
            <dt>Sessions</dt>
            <dd>{a.total}</dd>
          </div>
        )}
        <div>
          <dt>This week</dt>
          <dd>
            {a.week}
            {a.goal !== undefined && <span> / {a.goal}</span>}
          </dd>
        </div>
      </dl>
    </div>
  );
}


export default async function Overview({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === "insights" ? "insights" : "progress";
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;
  const today = new Date().toISOString().slice(0, 10);

  const [apps, contacts, outreachDates, attempts, cases, jobs, projects, profile] = await Promise.all([
    listApplications(db, userId),
    listContacts(db, userId),
    listInteractionDates(db, userId),
    listAttempts(db, userId),
    listCaseSessions(db, userId),
    listSourcedJobs(db, userId),
    listProjects(db, userId),
    getProfile(db, userId),
  ]);

  const openRoles = jobs.filter((j) => j.status === "new" || j.status === "shortlisted").length;
  const finishedCases = cases.filter((c) => c.status === "done" && c.overall !== null);
  const m = momentum({
    today,
    applications: apps.map((a) => ({ id: a.id, company: a.company, stage: a.stage, savedAt: a.savedAt, appliedAt: a.appliedAt })),
    outreachDates,
    practice: [
      ...attempts.map((a) => ({ date: a.createdAt, seconds: attemptSeconds(a) })),
      ...cases.map((c) => ({ date: c.updatedAt, seconds: caseSeconds(c.session.turns.map((t) => t.at)) })),
    ],
    openRoles,
    followupsDue: followupsDue(contacts, today).length,
    stale: staleApplications(apps, today).length,
    goals: homeGoalsFromEnv(await envFor(db, userId)),
  });

  const { title, body } = headline(m);
  const company = (id?: string) => apps.find((a) => a.id === id)?.company;
  const steps = m.next.map((n) => stepCopy(n, company(n.applicationId)));
  const primary = steps[0]!;

  const open = apps.filter((a) => a.stage !== "closed").length;
  const bullets = projects.flatMap((p) => p.bullets);
  const thin = bullets.filter((b) => needsMetric(b.text)).length;
  const practisedQuestions = new Set(attempts.map((a) => a.questionId)).size;
  const bestCase = finishedCases.reduce<number | null>((best, c) => (best === null || (c.overall ?? 0) > best ? c.overall : best), null);

  const reports = [
    { href: "/app", name: "Pipeline", value: plural(open, "open application"), sub: m.live ? `${m.live} in interviews` : `${m.tries} sent so far`, tone: "var(--stage-interview)" },
    { href: "/app/bank", name: "Experience", value: plural(bullets.length, "point"), sub: thin ? `${thin} could use a number` : "All points carry a number", tone: "var(--stage-applied)" },
    { href: "/app/watchlist", name: "Watchlist", value: plural(openRoles, "open role"), sub: openRoles ? "Waiting for a look" : "Add a company to watch", tone: "var(--stage-screening)" },
    { href: "/app/interview", name: "Interview", value: plural(practisedQuestions, "question"), sub: practisedQuestions ? "practised out loud" : "Not practised yet", tone: "var(--warm)" },
    { href: "/app/interview?tab=casing", name: "Cases", value: plural(finishedCases.length, "case"), sub: bestCase !== null ? `Best ${bestCase.toFixed(1)} / 5` : "Not tried yet", tone: "var(--stage-case)" },
  ];

  const insights = tab === "insights" ? roleInsights(apps, projects, profile?.taxonomy ?? { tags: {} }) : null;
  const families = tab === "insights" ? roleFamilies(apps) : [];
  const tabHref = (t: "progress" | "insights") => (t === "progress" ? "/app/home" : "/app/home?tab=insights");

  return (
    <>
      <section className={ui.homeHero} aria-labelledby="home-title">
        <h1 id="home-title">{title}</h1>
        <p>{body}</p>
        <div className={ui.homeHeroActions}>
          <Link href={primary.href} className={ui.btn} data-primary="">
            {primary.text}
          </Link>
          {m.tries > 0 && <span className={ui.homeTries}>{plural(m.tries, "application")} sent so far. Most close, and every one sharpens the next.</span>}
        </div>
      </section>

      <nav className={ui.tabs} aria-label="Overview">
        <Link href={tabHref("progress")} className={ui.tab} aria-current={tab === "progress" ? "page" : undefined} scroll={false}>
          Progress
        </Link>
        <Link href={tabHref("insights")} className={ui.tab} aria-current={tab === "insights" ? "page" : undefined} scroll={false}>
          Insights
        </Link>
      </nav>

      {tab === "progress" ? (
        <>
          <section className={ui.activities} aria-label="Your streaks">
            {m.activities.map((a) => (
              <ActivityCard key={a.key} a={a} practiceSeconds={m.practiceSeconds} />
            ))}
          </section>

          {steps.length > 1 && (
            <section className={ui.panel} aria-labelledby="next-title">
              <h2 id="next-title">After that</h2>
              <ol className={ui.nextSteps}>
                {steps.slice(1).map((s) => (
                  <li key={s.text}>
                    <Link href={s.href}>{s.text}</Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-labelledby="reports-title" className={ui.stack}>
            <h2 id="reports-title">Across your search</h2>
            <div className={ui.reports}>
              {reports.map((r) => (
                <Link key={r.name} href={r.href} className={ui.report} style={{ "--tone": r.tone } as React.CSSProperties}>
                  <span className={ui.reportName}>{r.name}</span>
                  <b>{r.value}</b>
                  <span>{r.sub}</span>
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : insights && insights.roles > 0 ? (
        <>
          <section className={ui.panel} aria-labelledby="searching-title">
            <h2 id="searching-title">What you are searching for</h2>
            <p className={ui.sub}>
              {plural(insights.roles, "role")} read so far
              {apps.length > insights.roles ? `, ${apps.length - insights.roles} not read yet` : ""}.
            </p>
            <div className={ui.chips}>
              {families.map((f) => (
                <span key={f.family} className={ui.tag} data-tone={toneFor(f.family)}>
                  {familyLabel(f.family)} · {f.roles}
                </span>
              ))}
            </div>
          </section>

          <section className={ui.panel} aria-labelledby="asks-title">
            <h2 id="asks-title">What those roles ask for</h2>
            <p className={ui.sub}>
              {plural(insights.requirements.filter((r) => r.status === "evidenced").length, "requirement")} on your CV,{" "}
              {insights.requirements.filter((r) => r.status === "unstated").length} you have done but not written down,{" "}
              {insights.requirements.filter((r) => r.status === "gap").length} not on record yet.
            </p>
            <ul className={ui.rows}>
              {insights.requirements.slice(0, 10).map((r) => (
                <li key={r.term} className={ui.row}>
                  <div>
                    <p>
                      <b>{familyLabel(r.term)}</b>
                    </p>
                    <span className={ui.sub}>
                      Asked by {r.roles} of {insights.roles} roles
                    </span>
                  </div>
                  <span className={ui.tag} data-tone={STATUS_TONE[r.status]}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              <Link href="/app/insights">See every requirement and make a plan for the gaps</Link>
            </p>
          </section>
        </>
      ) : (
        <p className={ui.empty}>
          No roles read yet. Add a job to your pipeline and its requirements show up here. <Link href="/app">Add a job</Link>
        </p>
      )}
    </>
  );
}
