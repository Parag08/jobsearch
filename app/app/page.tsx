import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listApplications } from "@/lib/repos/applications";
import { listContacts } from "@/lib/repos/contacts";
import { funnelStats, staleApplications } from "@/lib/pipeline";
import { followupsDue } from "@/lib/outreach";
import { STAGES, type Application, type Stage } from "@/lib/types";
import { JdForm } from "./jd-form";
import ui from "./ui.module.css";

const DEEP: Stage[] = ["interview", "case", "offer", "negotiation"];

/** Pipeline board (M5). Closed is neutral whatever the reason; only stale and due earn colour. */
export default async function Pipeline() {
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
  for (const a of apps) byStage[a.stage].push(a);

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

      <div className={ui.board}>
        {STAGES.map((stage) => (
          <section key={stage} className={ui.col} aria-label={stage}>
            <div
              className={ui.colHead}
              data-deep={DEEP.includes(stage) ? "" : undefined}
              style={{ "--stage-bg": `var(--stage-${stage})` } as React.CSSProperties}
            >
              <span>{stage}</span>
              <span>{byStage[stage].length}</span>
            </div>
            {byStage[stage].map((a) => (
              <Link key={a.id} href={`/app/applications/${a.id}`} className={ui.card} data-stale={stale.has(a.id) ? "" : undefined}>
                <b>{a.company}</b>
                <span className={ui.role}>{a.role}</span>
                {a.nextAction && <span className={ui.next}>{a.nextAction}</span>}
                {stale.has(a.id) && <span className={ui.badge} data-tone="stale">no response · follow up</span>}
                {a.stage === "closed" && a.closedReason && <span className={ui.badge}>{a.closedReason}</span>}
              </Link>
            ))}
          </section>
        ))}
      </div>

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
