import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { getApplication } from "@/lib/repos/applications";
import { getApplicationCv } from "@/lib/repos/cvs";
import { listProjects } from "@/lib/repos/projects";
import { applicationGaps } from "@/lib/editorial";
import { scoreBullet } from "@/lib/bullet-matcher";
import { canTransition } from "@/lib/pipeline";
import { STAGES, type Bullet, type Stage } from "@/lib/types";
import { moveStage, setNextAction, tailorCvAction } from "../../actions";
import ui from "../../ui.module.css";

/**
 * One application: the JD extract it was parsed into (once), the CV recipe
 * built from the bank, what the bank can and cannot evidence, and - after
 * `applied` - the frozen record of what was actually sent.
 */
export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;
  const { id } = await params;

  const app = await getApplication(db, userId, id);
  if (!app) notFound();
  const [cv, projects] = await Promise.all([
    app.cvVersionId ? getApplicationCv(db, userId, app.cvVersionId) : null,
    listProjects(db, userId),
  ]);
  const bullets = projects.flatMap((p) => p.bullets);
  const bank: Record<string, Bullet> = Object.fromEntries(bullets.map((b) => [b.id, b]));
  const gaps = app.jdExtract ? applicationGaps(app.jdExtract, bullets) : null;
  const nextStages = STAGES.filter((s) => canTransition(app.stage, s));

  return (
    <>
      <div className={ui.head}>
        <div>
          <p className={ui.mono}>
            <Link href="/app">Pipeline</Link> · {app.stage}
            {app.closedReason ? ` · ${app.closedReason}` : ""}
          </p>
          <h1>
            {app.company} — {app.role}
          </h1>
        </div>
        <span className={ui.mono}>
          saved {app.savedAt}
          {app.appliedAt ? ` · applied ${app.appliedAt}` : ""}
        </span>
      </div>

      <section className={ui.panel}>
        <h2>Move</h2>
        <div className={ui.actions}>
          {nextStages.map((s: Stage) =>
            s === "closed" ? (
              <form key={s} action={moveStage.bind(null, app.id, "closed", "withdrawn")}>
                <button className={ui.btn} type="submit">close (withdrawn)</button>
              </form>
            ) : (
              <form key={s} action={moveStage.bind(null, app.id, s, undefined)}>
                <button className={ui.btn} data-primary={s === "applied" ? "" : undefined} type="submit">
                  {s === "applied" ? "mark applied (freezes the CV)" : `→ ${s}`}
                </button>
              </form>
            ),
          )}
        </div>
        <form action={setNextAction.bind(null, app.id)} className={ui.form}>
          <input className={ui.input} name="nextAction" defaultValue={app.nextAction ?? ""} placeholder="Next action" style={{ flex: 1 }} />
          <button className={ui.btn} type="submit">set</button>
        </form>
      </section>

      <div className={ui.grid2}>
        <section className={ui.panel}>
          <h2>What the JD asks for</h2>
          {app.jdExtract ? (
            <>
              <p className={ui.sub}>
                {app.jdExtract.sectorPath.join(" › ")} · {app.jdExtract.roleFamily}
                {app.jdExtract.seniority ? ` · ${app.jdExtract.seniority}` : ""}
                {app.jdExtract.visaNote ? ` · ${app.jdExtract.visaNote}` : ""}
              </p>
              <div className={ui.chips}>
                {gaps?.evidenced.map((e) => (
                  <span key={e.term} className={ui.chip} data-tone="hit" title={`evidenced by ${e.bulletIds.length} bullet(s)`}>
                    {e.term}
                  </span>
                ))}
                {gaps?.gaps.map((g) => (
                  <span key={g.term} className={ui.chip} data-tone="gap" title="no bullet evidences this - a cover letter point, not a CV line">
                    {g.term}
                  </span>
                ))}
              </div>
              <p className={ui.sub}>
                Solid chips are backed by your bank; dashed ones are honest gaps — they belong in the cover letter, not on the CV.
              </p>
            </>
          ) : (
            <p className={ui.empty}>No structured extract yet. Paste the JD through POST /api/jd to parse it once.</p>
          )}
        </section>

        <section className={ui.panel}>
          <h2>CV</h2>
          {cv ? (
            <>
              <p className={ui.sub}>{cv.summaryLine}</p>
              <ul className={ui.rows}>
                {cv.bulletIds.map((bid) => {
                  const b = bank[bid];
                  const score = b && app.jdExtract ? scoreBullet(b, app.jdExtract) : 0;
                  return (
                    <li key={bid} className={ui.row}>
                      <p>{b ? (cv.diff.overrides?.[bid] ?? b.variants?.find((v) => v.label === cv.diff.variants?.[bid])?.text ?? b.text) : <em>bullet no longer in the bank</em>}</p>
                      <span className={ui.mono} title="lexical relevance to the JD extract">{score ? score.toFixed(1) : "—"}</span>
                    </li>
                  );
                })}
              </ul>
              {cv.sentSnapshot ? (
                <div className={ui.snapshot}>
                  <span className={ui.badge} data-tone="frozen">sent {cv.sentAt?.slice(0, 10)} · frozen</span>
                  <p className={ui.sub}>This is the exact text that left your hands. Bank edits since do not touch it.</p>
                </div>
              ) : (
                <p className={ui.sub}>Live recipe — bank edits flow through until you mark this applied.</p>
              )}
            </>
          ) : (
            <>
              <p className={ui.empty}>No tailored CV yet.</p>
              {app.jdExtract && (
                <form action={tailorCvAction.bind(null, app.id)}>
                  <button className={ui.btn} data-primary="" type="submit">Tailor from the master</button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
