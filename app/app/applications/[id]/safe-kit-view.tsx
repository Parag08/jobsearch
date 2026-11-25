import Link from "next/link";
import type { Application } from "@/lib/types";
import { getSourcingKit, usableKit } from "@/lib/services/sourcing-kits";
import { canTransition } from "@/lib/pipeline";
import { draftText, EVIDENCE_TEXT, fitsAnswer, PROMPTS, type EvidenceCode } from "@/lib/watchlist/safe-kit";
import { ClaudeRequest, CopySafeText } from "../../claude-request";
import { approveDraft } from "../../sourcing-actions";
import { PendingButton } from "../../sourcing-controls";
import { moveStage } from "../../actions";
import ui from "../../ui.module.css";
import s from "../../sourcing.module.css";
import { ConfirmSafeSubmission, RequestSafeDraft, ReviewSafeEvidence } from "./safe-kit-forms";

export function SafeKitView({ application: app, record, verified, today, error }: {
  application: Application; record: NonNullable<Awaited<ReturnType<typeof getSourcingKit>>>;
  verified: EvidenceCode[]; today: string; error?: string;
}) {
  const { revision } = record;
  const kit = usableKit(record.value, verified);
  const { id } = app;
  const editable = app.stage === "saved" && !kit.submission;
  const hasReview = kit.cvReviewed && kit.evidence.every((code) => verified.includes(code));
  const evidenceText = kit.evidence.map((code) => "- " + EVIDENCE_TEXT[code]).join("\n");
  return <>
    <header className={ui.head}>
      <div className={ui.headText}>
        <Link href="/app/watchlist">‹ Today</Link>
        {" · "}<Link href="/app">Pipeline</Link>
        <p className={s.eyebrow}>Application kit · {app.stage}</p>
        <h1>{app.role}</h1>
        <p className={ui.sub}>{app.companyId ? <Link href={"/app/companies/" + app.companyId}>{app.company}</Link> : app.company}
          {" · "}{kit.location ?? "Location not stated"}{kit.checkedAt ? " · Checked " + kit.checkedAt.slice(0, 10) : ""}</p>
      </div>
    </header>
    {error && <p className={s.notice} role="alert">Could not approve this draft. Reload, or ask your Claude to revise an over-limit answer.</p>}
    {kit.submission && <section className={ui.panel}>
      <h2>Submission confirmed</h2>
      <p>{app.role} · {app.company} · {kit.submission.date}</p>
      <p className={ui.sub}>{kit.submission.version === null ? "You used different materials." :
        "Reviewed safe content version " + kit.submission.version + " is frozen. This is not a copy of your portal submission."}</p>
      {app.nextAction && <p>{app.nextAction}</p>}
      {(["screening", "interview", "case", "offer", "negotiation"] as const).filter((stage) => canTransition(app.stage, stage)).map((stage) =>
        <form key={stage} action={moveStage.bind(null, id, stage, undefined)}><PendingButton label={"Move to " + stage} /></form>)}
    </section>}
    {canTransition(app.stage, "closed") && <details className={ui.panel}>
      <summary>Close application…</summary>
      <div className={s.formFoot} role="group" aria-label="Why it closed">
        <form action={moveStage.bind(null, id, "closed", "withdrawn")}><PendingButton label={kit.submission ? "I withdrew" : "I’m not applying"} /></form>
        {kit.submission && <>
          <form action={moveStage.bind(null, id, "closed", "lost")}><PendingButton label="They said no" /></form>
          <form action={moveStage.bind(null, id, "closed", "ghosted")}><PendingButton label="No reply" /></form>
        </>}
        {(app.stage === "offer" || app.stage === "negotiation") &&
          <form action={moveStage.bind(null, id, "closed", "won")}><PendingButton label="I accepted an offer" /></form>}
      </div>
    </details>}
    <div className={s.split}>
      <div className={s.stack}>
        <section className={ui.panel}>
          <h2>PII-free CV content</h2>
          <p className={s.tagline}>{kit.submission ? "Locked" : hasReview ? "Reviewed" : "Review needed"}</p>
          <p className={ui.sub}>Keep your name, contact details, employer names, education and final personal CV outside JobSearch.</p>
          {evidenceText ? <>
            <ul className={s.reasons}>{kit.evidence.map((code) => <li key={code}>{EVIDENCE_TEXT[code]}</li>)}</ul>
            <CopySafeText text={evidenceText} label="Copy PII-free content" />{" "}
            <a className={ui.btn} href={"/api/export/safe-sourcing/" + id}>Download PII-free content</a>
          </> : <p className={ui.sub}>No verified claims yet. The kit is Saved and you can continue later.</p>}
          {editable && <p><Link href="/app/settings/sourcing">Manage verified claims</Link></p>}
          {editable && kit.evidence.length !== record.value.evidence.length && <p className={ui.sub}>Withdrawn claims and drafts relying on them are hidden until you revise this kit.</p>}
          {editable && verified.length > 0 && <ReviewSafeEvidence key={revision} id={id} revision={revision}
            verified={verified} selected={kit.evidence} reviewed={hasReview} />}
        </section>
        {(["letter", "answer"] as const).map((section) => {
          const entry = kit[section];
          const text = entry?.draft ? draftText(entry.draft, section) : null;
          const request = section === "answer" ? kit.answer?.request : null;
          const fits = !text || !request || fitsAnswer(text, request);
          const label = section === "letter" ? "Cover letter" : "Portal answer";
          return <section key={section} className={ui.panel}>
            <h2>{label}</h2>
            <p className={s.tagline}>{!entry ? "Not requested" : !text ? "Requested" : entry.approved ? "Reviewed" : "Draft"}</p>
            {request && <p>{PROMPTS[request.prompt]} · Max {request.limit} {request.unit}</p>}
            {text && <>
              <p className={s.draft}>{text}</p>
              {request && <p className={ui.sub} role="status">{request.unit === "words" ? text.trim().split(/\s+/).length : Array.from(text).length} / {request.limit} {request.unit}{!fits && " · Over limit"}</p>}
              <details><summary>Why this is grounded</summary><p>{entry?.draft && EVIDENCE_TEXT[entry.draft.evidence]}</p></details>
              {entry?.approved && fits && <CopySafeText label={"Copy reviewed " + section} text={text} />}
              {editable && !entry?.approved && <form action={approveDraft.bind(null, id, section, revision)}>
                <PendingButton label={"Mark " + section + " reviewed"} disabled={!fits} />
              </form>}
            </>}
            {editable && !entry && <RequestSafeDraft id={id} section={section} disabled={!kit.evidence.length} />}
            {editable && !!entry && !entry.approved && <ClaudeRequest prompt={
              "Use get_sourcing_kit with applicationId " + id + ". For the requested " + section +
              ", choose an applicable verified evidence code and a tone. Use save_sourcing_draft with the current revision and only safe structured fields. Do not paste personal information."
            } />}
            {editable && section === "answer" && !!entry && <details><summary>Change question or limit</summary>
              <RequestSafeDraft id={id} section="answer" revise disabled={!kit.evidence.length} />
            </details>}
          </section>;
        })}
      </div>
      <aside className={s.stack}>
        <section className={ui.panel}>
          <h2>Company research</h2>
          <p className={ui.sub}>Shared across this company’s roles. It is not started automatically.</p>
          {app.companyId && <Link href={"/app/companies/" + app.companyId + "?view=research"}>Open company research</Link>}
        </section>
        <section className={ui.panel}>
          <h2>Apply in the employer portal</h2>
          <p className={ui.sub}>Opening the posting, copying or downloading does not mark this role Applied.</p>
          {app.applyUrl && <p><a className={ui.btn} href={app.applyUrl} target="_blank" rel="noreferrer">Open employer posting ↗</a></p>}
          {editable && <ConfirmSafeSubmission key={revision} id={id} revision={revision} today={today} role={app.role}
            company={app.company} hasReview={hasReview} />}
        </section>
      </aside>
    </div>
  </>;
}
