import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { getApplication } from "@/lib/repos/applications";
import { getApplicationCv } from "@/lib/repos/cvs";
import { listProjects } from "@/lib/repos/projects";
import { listStories } from "@/lib/repos/stories";
import { prepSet, competencyPrep, type CompetencyStatus } from "@/lib/stories";
import { applicationGaps } from "@/lib/editorial";
import { scoreBullet } from "@/lib/bullet-matcher";
import { canTransition } from "@/lib/pipeline";
import { STAGES, type Bullet, type Stage } from "@/lib/types";
import { moveStage, setNextAction, tailorCvAction } from "../../actions";
import { questionBank } from "../../interview/bank";
import ui from "../../ui.module.css";

/**
 * One application: the JD extract it was parsed into (once), the CV recipe
 * built from the bank, what the bank can and cannot evidence, and - after
 * `applied` - the frozen record of what was actually sent - and the interview prep
 * scoped to that CV: the competencies the JD implies, the story (or CV line) for each,
 * and the gaps.
 */

const STATUS_LABEL: Record<CompetencyStatus, string> = {
  story: "story ready",
  bullet: "CV line only",
  gap: "gap",
};
const STATUS_TONE: Record<CompetencyStatus, string | undefined> = { story: "hit", bullet: undefined, gap: "gap" };

/** Deep link into the behavioural bank, all firms, opened on one question. */
function questionHref(questionId: string | null): string {
  const sp = new URLSearchParams({ tab: "behavioural", firm: "all" });
  if (questionId) sp.set("q", questionId);
  return `/app/interview?${sp.toString()}`;
}
export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;
  const { id } = await params;

  const app = await getApplication(db, userId, id);
  if (!app) notFound();
  const [cv, projects, stories] = await Promise.all([
    app.cvVersionId ? getApplicationCv(db, userId, app.cvVersionId) : null,
    listProjects(db, userId),
    listStories(db, userId),
  ]);
  const bullets = projects.flatMap((p) => p.bullets);
  const bank: Record<string, Bullet> = Object.fromEntries(bullets.map((b) => [b.id, b]));
  const gaps = app.jdExtract ? applicationGaps(app.jdExtract, bullets) : null;
  const nextStages = STAGES.filter((s) => canTransition(app.stage, s));
  // The text the interviewer read: an override or chosen variant beats the bank line.
  const shownText = (b: Bullet) =>
    cv?.diff.overrides?.[b.id] ?? b.variants?.find((v) => v.label === cv?.diff.variants?.[b.id])?.text ?? b.text;
  const prep = app.jdExtract ? prepSet(cv?.bulletIds ?? [], bank, stories, app.jdExtract) : null;
  const byCompetency = prep ? competencyPrep(prep, stories, questionBank.questions) : [];
  const ready = byCompetency.filter((c) => c.status === "story").length;

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
            <p className={ui.empty}>
              No structured extract yet — open this application from a pasted posting on the{" "}
              <Link href="/app">pipeline board</Link> and it will be parsed once.
            </p>
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
                      <p>{b ? shownText(b) : <em>bullet no longer in the bank</em>}</p>
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

      <section className={ui.panel}>
        <div className={ui.head}>
          <h2>Interview prep for this application</h2>
          <Link href={questionHref(null)} className={ui.mono}>question bank →</Link>
        </div>
        {!prep ? (
          <p className={ui.empty}>Prep needs the JD extract — paste the posting first.</p>
        ) : byCompetency.length === 0 ? (
          <p className={ui.empty}>The JD names no behavioural competency we recognise. Practise the general set in the{" "}
            <Link href={questionHref(null)}>question bank</Link>.
          </p>
        ) : (
          <>
            <p className={ui.sub}>
              What this JD will likely probe, and what you have to answer with: {ready} of {byCompetency.length} backed by a
              story you have told.{" "}
              {cv ? "CV lines are from the CV on this application." : "Tailor a CV to see which of its lines back each one."}
            </p>
            <ul className={ui.rows}>
              {byCompetency.map((c) => (
                <li key={c.competency} className={ui.row}>
                  <div>
                    <p>
                      <b>{c.competency.replace(/-/g, " ")}</b>{" "}
                      <span className={ui.chip} data-tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</span>
                    </p>
                    {c.status === "story" &&
                      c.stories.map((s) => (
                        <p key={s.id} className={ui.sub}>Story: {s.result}</p>
                      ))}
                    {c.status === "bullet" && (
                      <>
                        <p className={ui.sub}>Build a story from: {shownText(c.bullets[0])}</p>
                        {c.bullets.length > 1 && (
                          <p className={ui.mono}>+{c.bullets.length - 1} more line(s) on this CV show it</p>
                        )}
                      </>
                    )}
                    {c.status === "gap" && (
                      <p className={ui.sub}>No story, and nothing on this CV shows it. Capture one before the interview.</p>
                    )}
                  </div>
                  {c.questionId ? (
                    <Link href={questionHref(c.questionId)} className={ui.mono}>practise →</Link>
                  ) : (
                    <span className={ui.mono} title="no bank question carries this competency">—</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {prep && prep.items.length > 0 && (
          <details>
            <summary className={ui.mono}>
              Each line on the CV · {prep.items.filter((i) => i.needsStory).length} without a story
            </summary>
            <ul className={ui.rows}>
              {prep.items.map((i) => (
                <li key={i.bulletId} className={ui.row}>
                  <div>
                    <p>{shownText(i.bullet)}</p>
                    {i.stories.map((s) => (
                      <p key={s.id} className={ui.sub}>
                        {i.matchedBy === "project" ? "Same project: " : "Story: "}
                        {s.result}
                      </p>
                    ))}
                    {i.numberIssues.map((n) => (
                      <p key={n.storyId} className={ui.sub}>
                        Numbers on the CV your story never says: {n.unmatched.join(", ")}
                      </p>
                    ))}
                  </div>
                  <span className={ui.chip} data-tone={i.needsStory ? "gap" : "hit"}>
                    {i.needsStory ? "needs a story" : i.matchedBy === "bullet" ? "story" : "project story"}
                  </span>
                </li>
              ))}
            </ul>
            {prep.unknownBulletIds.length > 0 && (
              <p className={ui.sub}>
                {prep.unknownBulletIds.length} line(s) on this CV are no longer in your bank.
              </p>
            )}
          </details>
        )}
      </section>
    </>
  );
}
