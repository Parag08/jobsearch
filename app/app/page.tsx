import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listApplications } from "@/lib/repos/applications";
import { listContacts } from "@/lib/repos/contacts";
import { byRecentActivity, funnelStats, recentApplications, staleApplications } from "@/lib/pipeline";
import { pipelineColumnMaxFromEnv, pipelineRecentDaysFromEnv } from "@/lib/pipeline-settings";
import { followupsDue } from "@/lib/outreach";
import { STAGES, type Application, type Stage } from "@/lib/types";
import { AddJob, AddJobGhost } from "./jd-form";
import { familyLabel, monogram, toneFor } from "@/lib/pipeline-display";
import ui from "./ui.module.css";

/** What an empty column is waiting for, so an empty track still says what goes there. */
const EMPTY_HINT: Partial<Record<Stage, string>> = {
  saved: "Jobs you add land here.",
  applied: "Mark a job as applied and it moves here.",
  screening: "A recruiter call or first screen.",
  interview: "Interview rounds.",
  case: "Case rounds.",
  offer: "Offers in hand.",
  negotiation: "Offers you are negotiating.",
};

/** The working stages get a column each, empty or not, so you can see the funnel at a glance. */
const ACTIVE: Stage[] = ["saved", "applied", "screening", "interview", "case", "offer"];

/**
 * Pipeline board (M5). Closed is neutral whatever the reason; only stale and due earn colour.
 * The board always opens on every application: a default window hid the whole board
 * whenever nothing had moved that week. With PIPELINE_RECENT_DAYS set, ?show=recent
 * narrows it to that window of activity; the stats always count everything.
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
  const showAll = recentDays === undefined || show !== "recent";
  const shown = showAll ? apps : recentApplications(apps, today, recentDays);
  for (const a of byRecentActivity(shown)) byStage[a.stage].push(a);
  const columnMax = pipelineColumnMaxFromEnv(process.env);
  // Negotiation only earns a column once something reaches it; closed is a count, not a column.
  const columns = byStage.negotiation.length ? [...ACTIVE, "negotiation" as Stage] : ACTIVE;
  const closed = byStage.closed.length;
  const label = (s: Stage) => s.charAt(0).toUpperCase() + s.slice(1);

  const card = (a: Application) => {
    const family = a.jdExtract?.roleFamily;
    return (
      <Link key={a.id} href={`/app/applications/${a.id}`} className={ui.card} data-stale={stale.has(a.id) ? "" : undefined}>
        <b className={ui.cardTitle}>{a.role}</b>
        <span className={ui.role}>{a.company}</span>
        <span className={ui.cardFoot}>
          <span className={ui.cardTags}>
            {family && (
              <span className={ui.tag} data-tone={toneFor(family)}>
                {familyLabel(family)}
              </span>
            )}
            {stale.has(a.id) && <span className={ui.tag} data-tone="stale">No reply in 2 weeks</span>}
            {a.stage === "closed" && a.closedReason && <span className={ui.tag}>{a.closedReason}</span>}
          </span>
          <span className={ui.monogram} data-tone={toneFor(a.company)} aria-hidden="true">
            {monogram(a.company)}
          </span>
        </span>
      </Link>
    );
  };

  return (
    <>
      <div className={ui.head}>
        <div className={ui.headText}>
          <h1>Pipeline</h1>
          <p className={ui.facts}>
            <span data-tone="open"><b>{active}</b> open</span>
            <span data-tone="applied"><b>{stats.applied}</b> applied</span>
            {stats.applied > 0 && <span><b>{Math.round(stats.responseRate * 100)}%</b> replied</span>}
            <span data-tone={stale.size ? "stale" : undefined}><b>{stale.size}</b> waiting over 2 weeks</span>
            <span data-tone={due.length ? "due" : undefined}><b>{due.length}</b> follow-ups due</span>
          </p>
        </div>
        <AddJob openFirst={apps.length === 0} />
      </div>

      {recentDays !== undefined && (
        <p className={ui.sub}>
          {showAll
            ? `All ${apps.length} applications. `
            : `${shown.length} of ${apps.length} applications moved in the last ${recentDays} days. `}
          <Link href={showAll ? "/app?show=recent" : "/app"}>{showAll ? `Only the last ${recentDays} days` : "Show all"}</Link>
        </p>
      )}

      <div className={ui.board} data-board="" style={{ "--cols": columns.length } as React.CSSProperties}>
        {columns.map((stage) => {
          const cards = byStage[stage];
          const top = columnMax === undefined ? cards : cards.slice(0, columnMax);
          const rest = cards.slice(top.length);
          return (
            <section key={stage} className={ui.col} aria-label={label(stage)}>
              <div className={ui.colHead} style={{ "--stage-bg": `var(--stage-${stage})` } as React.CSSProperties}>
                <span className={ui.stageDot} aria-hidden="true" />
                <span>{label(stage)}</span>
                <span className={ui.colCount}>{cards.length}</span>
              </div>
              {cards.length === 0 ? (
                <p className={ui.colEmpty}>{EMPTY_HINT[stage]}</p>
              ) : (
                <div className={ui.colCards}>{top.map(card)}</div>
              )}
              {rest.length > 0 && (
                <details className={ui.more}>
                  <summary>Show {rest.length} more</summary>
                  <div className={ui.colCards}>{rest.map(card)}</div>
                </details>
              )}
              {stage === "saved" && <AddJobGhost />}
            </section>
          );
        })}
      </div>
      {closed > 0 && (
        <details className={ui.more}>
          <summary>{closed} closed</summary>
          <div className={ui.closedRow}>{byStage.closed.map(card)}</div>
        </details>
      )}

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
