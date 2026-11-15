import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listApplications } from "@/lib/repos/applications";
import { listContacts } from "@/lib/repos/contacts";
import { byRecentActivity, funnelStats, recentApplications, staleApplications } from "@/lib/pipeline";
import { pipelineColumnMaxFromEnv, pipelineRecentDaysFromEnv } from "@/lib/pipeline-settings";
import { followupsDue } from "@/lib/outreach";
import { STAGES, type Application, type Stage } from "@/lib/types";
import { JdForm } from "./jd-form";
import ui from "./ui.module.css";

const DEEP: Stage[] = ["interview", "case", "offer", "negotiation"];

/**
 * Pipeline board (M5). Closed is neutral whatever the reason; only stale and due earn colour.
 * With PIPELINE_RECENT_DAYS set the board shows that window of activity, and ?show=all the
 * whole history; the stats always count everything.
 */
export default async function Pipeline({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;

  const today = new Date().toISOString().slice(0, 10);
  const [apps, contacts] = await Promise.all([listApplications(db, userId), listContacts(db, userId)]);
  const stats = funnelStats(apps);
  const stale = new Set(staleApplications(apps, today).map((a) => a.id));
  const due = followupsDue(contacts, today);
  const active = apps.filter((a) => a.stage !== "closed").length;

  const byStage = Object.fromEntries(STAGES.map((s) => [s, [] as Application[]])) as Record<Stage, Application[]>;
  const recentDays = pipelineRecentDaysFromEnv(process.env);
  const showAll = recentDays === undefined || show === "all";
  const shown = showAll ? apps : recentApplications(apps, today, recentDays);
  for (const a of byRecentActivity(shown)) byStage[a.stage].push(a);
  const columnMax = pipelineColumnMaxFromEnv(process.env);
  // Only stages with cards get a column, so they share the full width; empty ones are named in a line below.
  const busy = STAGES.filter((s) => byStage[s].length > 0);
  const empty = STAGES.filter((s) => byStage[s].length === 0);

  const card = (a: Application) => (
    <Link key={a.id} href={`/app/applications/${a.id}`} className={ui.card} data-stale={stale.has(a.id) ? "" : undefined}>
      <b>{a.company}</b>
      <span className={ui.role}>{a.role}</span>
      {a.nextAction && <span className={ui.next}>{a.nextAction}</span>}
      {stale.has(a.id) && <span className={ui.badge} data-tone="stale">no response · follow up</span>}
      {a.stage === "closed" && a.closedReason && <span className={ui.badge}>{a.closedReason}</span>}
    </Link>
  );

  return (
    <>
      <div className={ui.head}>
        <h1>Pipeline</h1>
        <span className={ui.mono}>{today}</span>
      </div>

      <div className={ui.stats}>
        <div className={ui.stat}><b>{active}</b><span>open applications</span></div>
        <div className={ui.stat}><b>{stats.applied}</b><span>ever applied</span></div>
        <div className={ui.stat}><b>{stats.applied ? Math.round(stats.responseRate * 100) : 0}%</b><span>response rate</span></div>
        <div className={ui.stat} data-tone={stale.size ? "stale" : undefined}><b>{stale.size}</b><span>stale past 14 days</span></div>
        <div className={ui.stat} data-tone={due.length ? "due" : undefined}><b>{due.length}</b><span>follow-ups due</span></div>
      </div>

      <section className={ui.panel}>
        <h2>Paste a job description</h2>
        <p className={ui.sub}>
          It is read once into structure - company, role, seniority, skills - and opens a saved
          application. The raw posting is kept for audit and never re-enters a prompt.
        </p>
        <JdForm />
      </section>

      {recentDays !== undefined && (
        <p className={ui.sub}>
          {showAll
            ? `All ${apps.length} applications. `
            : `${shown.length} of ${apps.length} applications: active in the last ${recentDays} days. `}
          <Link href={showAll ? "/app" : "/app?show=all"}>{showAll ? `Show the last ${recentDays} days` : "Show all"}</Link>
        </p>
      )}

      <div className={ui.board} style={{ gridTemplateColumns: `repeat(${Math.max(busy.length, 1)}, minmax(200px, 1fr))` }}>
        {busy.map((stage) => {
          const cards = byStage[stage];
          const top = columnMax === undefined ? cards : cards.slice(0, columnMax);
          const rest = cards.slice(top.length);
          return (
            <section key={stage} className={ui.col} aria-label={stage}>
              <div
                className={ui.colHead}
                data-deep={DEEP.includes(stage) ? "" : undefined}
                style={{ "--stage-bg": `var(--stage-${stage})` } as React.CSSProperties}
              >
                <span>{stage}</span>
                <span>{cards.length}</span>
              </div>
              <div className={ui.colCards}>{top.map(card)}</div>
              {rest.length > 0 && (
                <details className={ui.more}>
                  <summary>Show {rest.length} more</summary>
                  <div className={ui.colCards}>{rest.map(card)}</div>
                </details>
              )}
            </section>
          );
        })}
      </div>
      {empty.length > 0 && <p className={ui.mono}>Nothing in: {empty.join(" · ")}</p>}

      {due.length > 0 && (
        <section className={ui.panel}>
          <h2>Follow-ups due</h2>
          <ul className={ui.rows}>
            {due.map((c) => (
              <li key={c.id} className={ui.row}>
                <p>
                  <b>{c.name}</b>
                  {c.company ? ` · ${c.company}` : ""} — last: {c.interactions[0]?.summary ?? "no interaction logged"}
                </p>
                <span className={ui.mono}>{c.nextFollowup}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
