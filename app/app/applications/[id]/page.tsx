import Link from "next/link";
import { envFor } from "@/lib/services/settings";
import { notFound, redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { getApplication, getJdRaw } from "@/lib/repos/applications";
import { getApplicationCv } from "@/lib/repos/cvs";
import { listProjects } from "@/lib/repos/projects";
import { listStories } from "@/lib/repos/stories";
import { prepSet, competencyPrep, type CompetencyStatus } from "@/lib/stories";
import { shownBulletText } from "@/lib/stories/prep-view";
import { applicationGaps } from "@/lib/editorial";
import { canTransition } from "@/lib/pipeline";
import { familyLabel, shortDate } from "@/lib/pipeline-display";
import { STAGES, type Bullet, type ClosedReason, type Stage } from "@/lib/types";
import { draftCoverLetterAction, editCoverLetterAction, moveStage, setNextAction, tailorCvAction } from "../../actions";
import { getCoverLetter } from "@/lib/repos/cover-letters";
import { questionBank } from "../../interview/bank";
import ui from "../../ui.module.css";
import s from "./application.module.css";
import { ReadPosting } from "./read-posting";
import { applyFollowUpDaysFromEnv } from "@/lib/apply/follow-up";
import { getSourcingKit } from "@/lib/services/sourcing-kits";
import { getSafeEvidence } from "@/lib/repos/sourcing";
import { SafeKitView } from "./safe-kit-view";

/**
 * One application (DESIGN.md section 5, Application): where it stands and what to do next,
 * what the posting asks for against what you can show, the CV built for it, the cover letter
 * that speaks to what the CV can't, and the interview prep scoped to that CV. After it is
 * marked applied, the CV and letter are kept exactly as sent.
 */

/** The stepper's stages: the road to an offer. Closed sits apart, as a choice with a reason. */
const ROAD = STAGES.filter((st) => st !== "closed");

const CLOSE_REASONS: { reason: ClosedReason; label: string; from?: Stage[] }[] = [
  { reason: "withdrawn", label: "I withdrew" },
  { reason: "lost", label: "They said no" },
  { reason: "ghosted", label: "No reply" },
  { reason: "won", label: "I accepted an offer", from: ["offer", "negotiation"] },
];

const CLOSED_LABEL: Record<ClosedReason, string> = { withdrawn: "you withdrew", lost: "they said no", ghosted: "no reply", won: "offer accepted" };

const PREP_LABEL: Record<CompetencyStatus, string> = { story: "Story ready", bullet: "On your CV only", gap: "No story yet" };
const PREP_TONE: Record<CompetencyStatus, "good" | "mid" | "attention"> = { story: "good", bullet: "mid", gap: "attention" };

/** Deep link into the behavioural questions, all firms, opened on one question. */
function questionHref(questionId: string | null): string {
  const sp = new URLSearchParams({ tab: "behavioural" });
  if (questionId) sp.set("q", questionId);
  return `/app/interview?${sp.toString()}`;
}

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ letterError?: string; cvError?: string; applied?: string; kitError?: string }>;
}) {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;
  const { id } = await params;
  const { letterError, cvError, applied, kitError } = await searchParams;

  const app = await getApplication(db, userId, id);
  if (!app) notFound();
  if (app.hasSourcingKit) {
    const [record, verified] = await Promise.all([getSourcingKit(db, userId, id), getSafeEvidence(db, userId)]);
    if (!record) notFound();
    return <SafeKitView application={app} record={record} verified={verified} today={new Date().toISOString().slice(0, 10)} error={kitError} />;
  }
  const [cv, projects, stories, letter, jdRaw] = await Promise.all([
    app.cvVersionId ? getApplicationCv(db, userId, app.cvVersionId) : null,
    listProjects(db, userId),
    listStories(db, userId),
    getCoverLetter(db, userId, id),
    app.jdExtract ? null : getJdRaw(db, userId, id),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const followUpDays = applyFollowUpDaysFromEnv(await envFor(db, userId));
  const letterFrozen = app.appliedAt !== null;
  const bullets = projects.flatMap((p) => p.bullets);
  const bank: Record<string, Bullet> = Object.fromEntries(bullets.map((b) => [b.id, b]));
  const gaps = app.jdExtract ? applicationGaps(app.jdExtract, bullets, projects) : null;
  const gapTerms = gaps?.gaps.map((g) => familyLabel(g.term)) ?? [];
  // The text the interviewer read: an override or chosen variant beats the bank line.
  const shownText = (b: Bullet) => shownBulletText(cv?.diff, b);
  const prep = app.jdExtract ? prepSet(cv?.bulletIds ?? [], bank, stories, app.jdExtract) : null;
  const byCompetency = prep ? competencyPrep(prep, stories, questionBank.questions) : [];
  const ready = byCompetency.filter((c) => c.status === "story").length;
  const closed = app.stage === "closed";
  const reached = closed ? -1 : (ROAD as readonly Stage[]).indexOf(app.stage);
  // One primary per screen: the earliest step still to do.
  const primary: "cv" | "apply" | null = !cv && app.jdExtract ? "cv" : app.stage === "saved" ? "apply" : null;
  const location = app.jdExtract?.sectorPath.length ? app.jdExtract.sectorPath[app.jdExtract.sectorPath.length - 1] : null;

  return (
    <>
      <div className={ui.head}>
        <div className={ui.headText}>
          <Link href="/app" className={s.back}>
            <span aria-hidden="true">‹</span> Pipeline
          </Link>
          <h1>{app.company}</h1>
          <p className={ui.facts}>
            <span>{app.role}</span>
            <span>Saved {shortDate(app.savedAt, today)}</span>
            {app.appliedAt && <span>Applied {shortDate(app.appliedAt, today)}</span>}
          </p>
        </div>
      </div>

      {/* ---- just arrived from Apply on the Watchlist ---- */}
      {applied === "ready" && cv && app.stage === "saved" && (
        <p className={s.appliedNote} role="status">
          Ready to send: the posting is read and your CV is built for it.{" "}
          {app.applyUrl ? "Open the posting, apply there with this CV, then mark it applied here." : "Apply with this CV, then mark it applied here."}
        </p>
      )}
      {applied === "no-cv" && !cv && (
        <p className={s.appliedNote} data-tone="attention" role="status">
          The posting is read, but the CV couldn&apos;t be built yet. Build it from the CV panel below.
        </p>
      )}

      {/* ---- the posting, when it isn't read yet ---- */}
      {!app.jdExtract && (
        <section className={ui.panel} aria-labelledby="posting-h">
          <h2 id="posting-h">Add the posting</h2>
          <ReadPosting applicationId={app.id} kept={Boolean(jdRaw?.trim())} url={app.applyUrl ?? null} />
        </section>
      )}

      {/* ---- where it stands ---- */}
      <section className={ui.panel} aria-labelledby="stage-h">
        <h2 id="stage-h" className={s.srOnly}>
          Stage
        </h2>
        {closed ? (
          <p className={s.closed}>
            <span className={ui.tag}>Closed</span> {app.closedReason ? `Closed: ${CLOSED_LABEL[app.closedReason]}.` : "Closed."} A closed
            application is a try, not a failure.
          </p>
        ) : (
          <ol className={s.stepper}>
            {ROAD.map((st, i) => {
              const state = i < reached ? "done" : i === reached ? "current" : "ahead";
              const label = familyLabel(st);
              return (
                <li key={st} className={s.step} data-state={state} style={{ "--stage": `var(--stage-${st})` } as React.CSSProperties}>
                  {canTransition(app.stage, st) ? (
                    <form action={moveStage.bind(null, app.id, st, undefined)}>
                      <button type="submit" className={s.stepBtn} aria-label={`Move to ${label}`}>
                        <span className={s.stepDot} aria-hidden="true" />
                        <span>{label}</span>
                      </button>
                    </form>
                  ) : (
                    <span className={s.stepBtn} aria-current="step">
                      <span className={s.stepDot} aria-hidden="true" />
                      <span>{label}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {app.stage === "saved" && (
          <div className={s.applyRow}>
            <div className={s.applySteps}>
              {app.applyUrl && (
                <a className={ui.btn} href={app.applyUrl} target="_blank" rel="noopener noreferrer">
                  Open the posting <span aria-hidden="true">↗</span>
                </a>
              )}
              {cv && (
                <a className={ui.btn} href={`/api/export/${app.id}?format=pdf`}>
                  Download CV
                </a>
              )}
              <form action={moveStage.bind(null, app.id, "applied", undefined)}>
                <button className={ui.btn} data-primary={primary === "apply" ? "" : undefined} type="submit">
                  Mark as applied
                </button>
              </form>
            </div>
            <p className={ui.sub}>
              {app.applyUrl ? "Apply on their site with this CV, then mark it here. " : ""}We&apos;ll keep a copy of the CV and letter exactly as
              you sent them{followUpDays ? `, and remind you to follow up after ${followUpDays} days` : ""}.
            </p>
          </div>
        )}

        <div className={s.stageFoot}>
          <form action={setNextAction.bind(null, app.id)} className={s.nextForm}>
            <label className={s.label} htmlFor="next-step">
              Next step
            </label>
            <div className={s.nextRow}>
              <input id="next-step" className={ui.input} name="nextAction" defaultValue={app.nextAction ?? ""} placeholder="Follow up with the recruiter on Friday" />
              <button className={ui.btn} type="submit">
                Save
              </button>
            </div>
          </form>
          {!closed && (
            <details className={s.closeMenu}>
              <summary className={ui.textBtn} data-tone="quiet">
                Close application…
              </summary>
              <div className={s.reasons} role="group" aria-label="Why it closed">
                {CLOSE_REASONS.filter((r) => !r.from || r.from.includes(app.stage)).map((r) => (
                  <form key={r.reason} action={moveStage.bind(null, app.id, "closed", r.reason)}>
                    <button className={ui.btn} type="submit">
                      {r.label}
                    </button>
                  </form>
                ))}
              </div>
            </details>
          )}
        </div>
      </section>

      <div className={ui.grid2}>
        {/* ---- what they want ---- */}
        <section className={ui.panel} aria-labelledby="asks-h">
          <h2 id="asks-h">What they&apos;re looking for</h2>
          {app.jdExtract ? (
            <>
              <p className={ui.sub}>
                {[familyLabel(app.jdExtract.roleFamily), app.jdExtract.seniority, location].filter(Boolean).join(" · ")}
              </p>
              {gaps && gaps.evidenced.length > 0 && (
                <div className={s.group}>
                  <p className={s.label}>You can show this</p>
                  <div className={ui.chips}>
                    {gaps.evidenced.map((e) => (
                      <span key={e.term} className={ui.tag} data-tone="good" title={`Backed by ${e.bulletIds.length} ${e.bulletIds.length === 1 ? "point" : "points"} in your experience`}>
                        {familyLabel(e.term)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {gaps && gaps.gaps.length > 0 && (
                <div className={s.group}>
                  <p className={s.label}>Not on your record yet</p>
                  <div className={ui.chips}>
                    {gaps.gaps.map((g) => (
                      <span key={g.term} className={ui.tag} data-tone="attention">
                        {familyLabel(g.term)}
                      </span>
                    ))}
                  </div>
                  <p className={ui.sub}>Address these in your cover letter, not on the CV.</p>
                </div>
              )}
              {app.jdExtract.visaNote && <p className={ui.sub}>Who can apply: {app.jdExtract.visaNote.replace(/^eligibility:\s*/i, "")}</p>}
            </>
          ) : (
            <p className={ui.none}>
              We haven&apos;t read this job posting yet. Add it from the <Link href="/app">pipeline</Link> with the full posting
              and we&apos;ll read it.
            </p>
          )}
        </section>

        {/* ---- the CV ---- */}
        <section className={ui.panel} id="cv" aria-labelledby="cv-h">
          <h2 id="cv-h">CV</h2>
          {cvError && (
            <p className={s.alert} role="alert">
              {cvError}
            </p>
          )}
          {cv ? (
            <>
              <div>
                <p className={s.label}>Summary line on the CV</p>
                <p className={s.summaryLine}>{cv.summaryLine}</p>
              </div>
              <ul className={s.lines}>
                {cv.bulletIds.map((bid) => {
                  const b = bank[bid];
                  return <li key={bid}>{b ? shownText(b) : <em className={ui.sub}>A point you&apos;ve since deleted</em>}</li>;
                })}
              </ul>
              {(() => {
                const ed = cv.diff.editorial;
                if (!ed) return null;
                const capped = ed.decisions.filter((d) => d.kind === "capped").length;
                const sameStory = ed.decisions.filter((d) => d.kind === "collision").length;
                const shortened = ed.actions.filter((a) => a.kind === "short-variant").length;
                const dropped = ed.actions.filter((a) => a.kind === "drop").length;
                const notes = [
                  ed.fit ? `Fits one page: ${ed.fit.linesUsed} of ${ed.fit.lineBudget} lines` : "",
                  shortened ? `${shortened} shortened to fit` : "",
                  dropped ? `${dropped} left out for space` : "",
                  capped ? `${capped} left out to keep any one role from crowding the page` : "",
                  sameStory ? `${sameStory} left out as the same story told twice` : "",
                ].filter(Boolean);
                return notes.length ? <p className={ui.sub}>{notes.join(". ")}.</p> : null;
              })()}
              <div className={ui.actions}>
                <a className={ui.btn} href={`/api/export/${app.id}?format=pdf`}>
                  Download PDF
                </a>
                <a className={ui.btn} href={`/api/export/${app.id}?format=docx`}>
                  Download Word
                </a>
                {!cv.sentSnapshot && app.jdExtract && (
                  <form action={tailorCvAction.bind(null, app.id)}>
                    <button className={ui.textBtn} type="submit">
                      Rebuild CV
                    </button>
                  </form>
                )}
              </div>
              <p className={ui.sub}>
                {cv.sentSnapshot
                  ? `Sent ${cv.sentAt ? shortDate(cv.sentAt, today) : ""}. This is exactly what you sent; editing your experience doesn't change it.`
                  : "This CV updates when you edit your experience. It's locked once you mark it applied."}
              </p>
            </>
          ) : (
            <>
              <p className={ui.none}>No CV for this job yet. We&apos;ll build one from your experience, using only what you can back.</p>
              {app.jdExtract && (
                <form action={tailorCvAction.bind(null, app.id)}>
                  <button className={ui.btn} data-primary={primary === "cv" ? "" : undefined} type="submit">
                    Build CV
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </div>

      {/* ---- the cover letter ---- */}
      <section className={ui.panel} id="cover-letter" aria-labelledby="letter-h">
        <div>
          <h2 id="letter-h">Cover letter</h2>
          <p className={ui.sub}>
            Three short paragraphs: your path so far, why this firm, and where you&apos;d help.
            {gapTerms.length ? ` It's also where to address what your CV can't show: ${gapTerms.join(", ")}.` : ""}
          </p>
        </div>
        {letterError && (
          <p className={s.alert} role="alert">
            {letterError}
          </p>
        )}
        {letter && (
          <>
            <p className={ui.sub}>
              {[
                `Dear ${letter.recipient || letter.teamName}`,
                // Already written out by letterDate ("19 November 2026"), not an ISO date.
                letter.date,
                letter.edited ? "Edited by you" : "Drafted for you",
                letterFrozen ? "Sent, kept as it was" : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {letter.issues.length > 0 && (
              <ul className={s.issues}>
                {letter.issues.map((i) => (
                  <li key={i.kind + i.detail}>
                    <span className={ui.tag} data-tone="attention">
                      {familyLabel(i.kind)}
                    </span>
                    <span className={ui.sub}>{i.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {letterFrozen ? (
              <div className={s.prose}>
                {letter.paragraphs.map((p, n) => (
                  <p key={n}>{p}</p>
                ))}
              </div>
            ) : (
              <form action={editCoverLetterAction.bind(null, app.id)} className={ui.stack}>
                <label className={s.label} htmlFor="letter-body">
                  The letter (three paragraphs, separated by a blank line)
                </label>
                <textarea id="letter-body" name="body" className={ui.answerBox} rows={16} defaultValue={letter.paragraphs.join("\n\n")} />
                <div className={ui.actions}>
                  <button className={ui.btn} type="submit">
                    Save edits
                  </button>
                  <a className={ui.btn} href={`/api/export/${app.id}?format=pdf&doc=letter`}>
                    Download PDF
                  </a>
                  <a className={ui.btn} href={`/api/export/${app.id}?format=docx&doc=letter`}>
                    Download Word
                  </a>
                </div>
              </form>
            )}
            {letterFrozen && (
              <div className={ui.actions}>
                <a className={ui.btn} href={`/api/export/${app.id}?format=pdf&doc=letter`}>
                  Download PDF
                </a>
                <a className={ui.btn} href={`/api/export/${app.id}?format=docx&doc=letter`}>
                  Download Word
                </a>
              </div>
            )}
          </>
        )}
        {!letterFrozen &&
          app.jdExtract &&
          (() => {
            const form = (
              <form action={draftCoverLetterAction.bind(null, app.id)} className={s.letterForm}>
                <label className={s.field}>
                  <span className={s.label}>What caught your eye about {app.company}?</span>
                  <span className={ui.sub}>
                    Something specific you found, not from their careers page. The letter uses only this, so it won&apos;t invent
                    facts about the firm.
                  </span>
                  <textarea name="firmDetail" className={ui.answerBox} rows={4} required defaultValue={letter?.firmDetail ?? ""} />
                </label>
                <div className={s.fieldRow}>
                  <label className={s.field}>
                    <span className={s.label}>Addressed to (optional)</span>
                    <input className={ui.input} name="recipient" placeholder="The hiring manager's name" defaultValue={letter?.recipient ?? ""} />
                  </label>
                  <label className={s.field}>
                    <span className={s.label}>Otherwise, the team</span>
                    <input className={ui.input} name="teamName" placeholder={`${app.company} Recruitment Team`} defaultValue={letter?.teamName ?? ""} />
                  </label>
                </div>
                <div className={ui.actions}>
                  <button className={ui.btn} type="submit">
                    {letter ? "Rewrite cover letter" : "Write cover letter"}
                  </button>
                </div>
              </form>
            );
            return letter ? (
              <details className={ui.reveal}>
                <summary>Rewrite it from scratch</summary>
                {form}
              </details>
            ) : (
              form
            );
          })()}
        {!app.jdExtract && <p className={ui.none}>The letter needs the job posting read first.</p>}
      </section>

      {/* ---- interview prep ---- */}
      <section className={ui.panel} aria-labelledby="prep-h">
        <div className={s.prepHead}>
          <h2 id="prep-h">Interview prep for this job</h2>
          <Link href={questionHref(null)} className={ui.sumLink}>
            All interview questions
          </Link>
        </div>
        {!prep ? (
          <p className={ui.none}>Prep needs the job posting read first.</p>
        ) : byCompetency.length === 0 ? (
          <p className={ui.none}>
            This posting doesn&apos;t point to specific interview themes. <Link href={questionHref(null)}>Practise the general questions.</Link>
          </p>
        ) : (
          <>
            <p className={ui.sub}>
              What this job will likely probe, and what you have to answer with: {ready} of {byCompetency.length} backed by a story
              you&apos;ve told. {cv ? "CV lines are from the CV for this job." : "Build the CV to see which of its lines back each one."}
            </p>
            <ul className={s.prepList}>
              {byCompetency.map((c) => (
                <li key={c.competency} className={s.prepItem}>
                  <div className={s.prepMain}>
                    <p className={s.prepTitle}>
                      {familyLabel(c.competency)}
                      <span className={ui.tag} data-tone={PREP_TONE[c.status]}>
                        {PREP_LABEL[c.status]}
                      </span>
                    </p>
                    {c.status === "story" &&
                      c.stories.map((st) => (
                        <p key={st.id} className={ui.sub}>
                          Your story: {st.result}
                        </p>
                      ))}
                    {c.status === "bullet" && (
                      <p className={ui.sub}>
                        Build a story from: {shownText(c.bullets[0])}
                        {c.bullets.length > 1 ? ` (and ${c.bullets.length - 1} more ${c.bullets.length === 2 ? "line" : "lines"} on this CV)` : ""}
                      </p>
                    )}
                    {c.status === "gap" && <p className={ui.sub}>No story, and nothing on this CV shows it. Capture one before the interview.</p>}
                  </div>
                  {c.questionId && (
                    <Link href={questionHref(c.questionId)} className={ui.sumLink} aria-label={`Practise ${familyLabel(c.competency)}`}>
                      Practise
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {prep && prep.items.length > 0 && (
          <details className={ui.reveal}>
            <summary>
              Stories behind your CV: {prep.items.filter((i) => i.needsStory).length} still to write
            </summary>
            <ul className={s.prepList}>
              {prep.items.map((i) => (
                <li key={i.bulletId} className={s.prepItem}>
                  <div className={s.prepMain}>
                    <p>{shownText(i.bullet)}</p>
                    {i.stories.map((st) => (
                      <p key={st.id} className={ui.sub}>
                        {i.matchedBy === "project" ? "From the same project: " : "Your story: "}
                        {st.result}
                      </p>
                    ))}
                    {i.numberIssues.map((n) => (
                      <p key={n.storyId} className={s.warnText}>
                        The CV gives numbers your story never says: {n.unmatched.join(", ")}
                      </p>
                    ))}
                  </div>
                  <span className={ui.tag} data-tone={i.needsStory ? "attention" : "good"}>
                    {i.needsStory ? "Needs a story" : i.matchedBy === "bullet" ? "Story ready" : "Project story"}
                  </span>
                </li>
              ))}
            </ul>
            {prep.unknownBulletIds.length > 0 && (
              <p className={ui.sub}>
                {prep.unknownBulletIds.length} {prep.unknownBulletIds.length === 1 ? "line" : "lines"} on this CV {prep.unknownBulletIds.length === 1 ? "is" : "are"} no
                longer in your experience.
              </p>
            )}
          </details>
        )}
      </section>
    </>
  );
}
