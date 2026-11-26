import Link from "next/link";
import { envFor } from "@/lib/services/settings";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listApplications } from "@/lib/repos/applications";
import { listContactsWithInteractions } from "@/lib/repos/contacts";
import { byRecentActivity, recentApplications, staleApplications } from "@/lib/pipeline";
import { pipelineColumnMaxFromEnv, pipelineRecentDaysFromEnv } from "@/lib/pipeline-settings";
import { followupsDue } from "@/lib/outreach";
import { STAGES, type Application, type Stage } from "@/lib/types";
import { AddJob, AddJobGhost } from "./jd-form";
import { monogram, toneFor } from "@/lib/pipeline-display";
import ui from "./ui.module.css";
import sourcing from "./sourcing.module.css";
import { Insights } from "./insights/insights-view";
import { InsightsLinkStatus } from "./insights/link-status";

/**
 * Pipeline board (M5). Closed is neutral whatever the reason; only stale and due earn colour.
 * The board always opens on every application: a default window hid the whole board
 * whenever nothing had moved that week. With PIPELINE_RECENT_DAYS set, ?show=recent
 * narrows it to that window of activity.
 */
export default async function Pipeline({ searchParams }: { searchParams: Promise<{ show?: string; view?: string; family?: string; title?: string; error?: string; read?: string; failed?: string }> }) {
  const params = await searchParams;
  const { show, view } = params;
  const tabs = (
    <nav aria-label="Pipeline views" className={sourcing.tabs}>
      <Link href="/app" aria-current={view !== "insights" ? "page" : undefined}>Applications</Link>
      <Link href="/app?view=insights" prefetch={false} aria-current={view === "insights" ? "page" : undefined} aria-label="Role insights">
        Role insights<InsightsLinkStatus />
      </Link>
    </nav>
  );
  if (view === "insights") return <>{tabs}<Insights params={params} /></>;
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;

  const today = new Date().toISOString().slice(0, 10);
  const [apps, contacts] = await Promise.all([listApplications(db, userId), listContactsWithInteractions(db, userId)]);
  const stale = new Set(staleApplications(apps, today).map((a) => a.id));
  const due = followupsDue(contacts, today);

  const byStage = Object.fromEntries(STAGES.map((s) => [s, [] as Application[]])) as Record<Stage, Application[]>;
  const env = await envFor(db, userId);
  const recentDays = pipelineRecentDaysFromEnv(env);
  const showAll = recentDays === undefined || show !== "recent";
  const shown = showAll ? apps : recentApplications(apps, today, recentDays);
  for (const a of byRecentActivity(shown)) byStage[a.stage].push(a);
  const columnMax = pipelineColumnMaxFromEnv(env);
  const columns = STAGES.filter((stage) => stage !== "closed" && byStage[stage].length);
  const empty = STAGES.filter((stage) => stage !== "closed" && !byStage[stage].length);
  const closed = byStage.closed.length;
  const label = (s: Stage) => s.charAt(0).toUpperCase() + s.slice(1);

  const card = (a: Application) => {
    return (
      <Link key={a.id} href={`/app/applications/${a.id}`} className={ui.card} data-stale={stale.has(a.id) ? "" : undefined}>
        <b className={ui.cardTitle}>{a.role}</b>
        <span className={ui.role}>{a.company}</span>
        <span className={ui.cardFoot}>
          <span className={ui.cardTags}>
            {a.stage !== "closed" && a.nextAction && <span>{a.nextAction}</span>}
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
      {tabs}
      <div className={ui.head}>
        <h1>Applications</h1>
        <AddJob openFirst={apps.length === 0} />
      </div>

      {recentDays !== undefined && (
        <p className={ui.sub}>
          <Link href={showAll ? "/app?show=recent" : "/app"}>{showAll ? `Only the last ${recentDays} days` : "Show all"}</Link>
        </p>
      )}

      {columns.length > 0 && <div className={ui.board} data-board="" style={{ "--cols": columns.length } as React.CSSProperties}>
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
              <div className={ui.colCards}>{top.map(card)}</div>
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
      </div>}
      {empty.length > 0 && <details className={ui.more}>
        <summary>Empty stages</summary>
        <ul>{empty.map((stage) => <li key={stage}>{label(stage)}</li>)}</ul>
      </details>}
      <details className={ui.more}>
        <summary>{closed ? `${closed} closed` : "Closed"}</summary>
        <div className={ui.closedRow}>{byStage.closed.map(card)}</div>
      </details>

      {due.length > 0 && (
        <section className={ui.panel}>
          <h2>
            <Link href="/app/network">Follow-ups due</Link>
          </h2>
          <ul className={ui.rows}>
            {due.map((c) => (
              <li key={c.id} className={ui.row}>
                <p>
                  <b>
                    <Link href={`/app/network#contact-${c.id}`}>{c.name}</Link>
                  </b>
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
