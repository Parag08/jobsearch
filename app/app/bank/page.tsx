import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listProjects } from "@/lib/repos/projects";
import { listApplicationCvs } from "@/lib/repos/cvs";
import { getProfile } from "@/lib/repos/profiles";
import { needsMetric, readiness, nudgeQueue, POINTS_PER_ROLE } from "@/lib/onboarding";
import { cvUsage, effectiveStrength, isRecentRole, strengthMix, todoItems } from "@/lib/bank/display";
import { monogram, toneFor } from "@/lib/pipeline-display";
import { AddPoint, OpenOnHash, PointRow } from "./point";
import ui from "../ui.module.css";
import s from "./bank.module.css";

const TODO_SHOWN = 3;
/** Roles open on arrival: the recent ones, or the first few when none are recent. */
const OPEN_FALLBACK = 2;

/**
 * The bullet bank (M2), the single source of evidence (DESIGN.md section 5, Bank). A summary
 * panel says how ready the bank is; the to-do list turns deferred onboarding nudges into
 * sentences that link to their role or point; each role is a collapsible panel of points you
 * can edit in place. A point with no number is marked, never hidden.
 */
export default async function Bank({ searchParams }: { searchParams: Promise<{ only?: string; todo?: string }> }) {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;
  const q = await searchParams;
  const onlyGaps = q.only === "needs-number";
  const allTodos = q.todo === "all";

  const [projects, profile, cvs] = await Promise.all([
    listProjects(db, userId),
    getProfile(db, userId),
    listApplicationCvs(db, userId).catch(() => []),
  ]);
  const bullets = projects.flatMap((p) => p.bullets);
  const thisYear = new Date().getFullYear();
  const recent = (dates: string | null) => isRecentRole(dates, thisYear);
  const usage = cvUsage(cvs);

  const ready = readiness({
    identity: Boolean(profile?.displayName),
    education: projects.some((p) => /school|university|insead|mba|college/i.test(`${p.org} ${p.name}`)),
    roles: projects.map((p) => ({ points: p.bullets.length, recent: recent(p.dates) })),
    targets: profile?.roleFamilies.length ?? 0,
  });
  const nudges = nudgeQueue({
    targets: profile?.roleFamilies.length ?? 0,
    workAuthorisation: Boolean(profile?.visaContext),
    languages: false,
    summary: false,
    roles: projects.map((p) => ({ id: p.id, points: p.bullets.length, recent: recent(p.dates) })),
    bullets: bullets.map((b) => ({ id: b.id, needsMetric: needsMetric(b.text) })),
  });

  const roleName = (p: (typeof projects)[number]) => p.org || p.name;
  const todos = todoItems(nudges, {
    roles: Object.fromEntries(projects.map((p) => [p.id, { name: roleName(p), points: p.bullets.length }])),
    points: Object.fromEntries(projects.flatMap((p) => p.bullets.map((b) => [b.id, { text: b.text, role: roleName(p) }]))),
    pointsPerRole: POINTS_PER_ROLE,
  });
  const shownTodos = allTodos ? todos : todos.slice(0, TODO_SHOWN);

  const mix = strengthMix(bullets.map((b) => ({ strength: effectiveStrength(b) })));
  const gaps = bullets.filter((b) => needsMetric(b.text)).length;
  const families = [...new Set(bullets.map((b) => b.roleFamily))].sort();
  const anyRecent = projects.some((p) => recent(p.dates));
  const readyLine =
    ready.score >= 100
      ? "Enough for a credible one-page CV"
      : `Still to add: ${ready.missing.filter((m) => !m.startsWith("recent role ")).join(", ")}`;

  const roles = projects
    .map((p) => ({ ...p, bullets: onlyGaps ? p.bullets.filter((b) => needsMetric(b.text)) : p.bullets }))
    .filter((p) => !onlyGaps || p.bullets.length > 0);

  return (
    <>
      <OpenOnHash />
      <div className={ui.head}>
        <h1>Bank</h1>
        <span className={s.count}>
          {bullets.length} point{bullets.length === 1 ? "" : "s"} across {projects.length} role{projects.length === 1 ? "" : "s"}
        </span>
      </div>

      <section className={ui.panel} aria-label="Bank summary">
        <div className={s.summary}>
        <div className={s.stat}>
          <span className={s.statLabel}>CV readiness</span>
          <b className={s.statValue}>{ready.score}%</b>
          <div className={ui.meter} aria-hidden="true">
            <i style={{ "--w": `${ready.score}%` } as React.CSSProperties} />
          </div>
          <span className={s.statNote}>{readyLine}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Point strength</span>
          <div className={s.mix} role="img" aria-label={`${mix.strong} strong, ${mix.solid} solid, ${mix.weak} weak`}>
            {(["strong", "solid", "weak"] as const).map((b) => (mix[b] > 0 ? <i key={b} data-band={b} style={{ flexGrow: mix[b] }} /> : null))}
          </div>
          <span className={s.legend}>
            <span data-band="strong">{mix.strong} strong</span>
            <span data-band="solid">{mix.solid} solid</span>
            <span data-band="weak">{mix.weak} weak</span>
          </span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Missing a number</span>
          <b className={s.statValue} data-tone={gaps ? "stale" : undefined}>{gaps}</b>
          {gaps > 0 &&
            (onlyGaps ? (
              <Link href="/app/bank" className={s.statLink}>Show every point</Link>
            ) : (
              <Link href="/app/bank?only=needs-number" className={s.statLink}>Show only these</Link>
            ))}
        </div>
        </div>
      </section>

      {todos.length > 0 && (
        <section className={ui.panel} aria-labelledby="todo-h">
          <h2 id="todo-h">To do</h2>
          <ul className={s.todos}>
            {shownTodos.map((t) => (
              <li key={t.key}>
                {t.href ? <a href={t.href}>{t.text}</a> : <span>{t.text}</span>}
                {t.where && <span className={s.where}>{t.where}</span>}
              </li>
            ))}
          </ul>
          {todos.length > TODO_SHOWN && (
            <Link href={allTodos ? "/app/bank" : "/app/bank?todo=all"} className={s.statLink} scroll={false}>
              {allTodos ? "Show fewer" : `Show ${todos.length - TODO_SHOWN} more`}
            </Link>
          )}
        </section>
      )}

      {onlyGaps && <p className={s.filterNote}>Showing only points without a number.</p>}

      {roles.map((p, i) => {
        const open = onlyGaps || (anyRecent ? recent(p.dates) : i < OPEN_FALLBACK);
        const n = projects.find((x) => x.id === p.id)?.bullets.length ?? p.bullets.length;
        return (
          <details key={p.id} id={`role-${p.id}`} className={ui.panel} open={open}>
            <summary className={s.roleHead}>
              <span className={`${ui.monogram} ${s.roleMark}`} data-tone={toneFor(roleName(p))} aria-hidden="true">
                {monogram(roleName(p))}
              </span>
              <span className={s.roleTitle}>
                <b>{roleName(p)}</b>
                <span>{[p.role, p.dates, `${n} point${n === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span>
              </span>
              <span className={s.chevron} aria-hidden="true" />
            </summary>
            {p.bullets.length === 0 ? (
              <p className={ui.sub}>No points yet. Add what you did here, with a number if you have one.</p>
            ) : (
              <ul className={s.points}>
                {p.bullets.map((b) => (
                  <PointRow key={b.id} point={b} families={families} usage={usage[b.id]} />
                ))}
              </ul>
            )}
            <AddPoint projectId={p.id} families={families} role={roleName(p)} />
          </details>
        );
      })}
    </>
  );
}
