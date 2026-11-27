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

export function SafeKitView({ application: app, record, verified, researchStatus, today, error }: {
  application: Application; record: NonNullable<Awaited<ReturnType<typeof getSourcingKit>>>;
  verified: EvidenceCode[]; researchStatus: string; today: string; error?: string;
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
        <p className={ui.sub}>{app.companyId ? <Link href={"/app/companies/" + app.companyId}>{app.company}</Link> : app.company}
          {" · "}<strong>{app.stage.charAt(0).toUpperCase() + app.stage.slice(1)}</strong></p>
        <h1>{app.role}</h1>
        <p className={ui.sub}>{kit.location ?? "Location not stated"}{kit.checkedAt ? " · Employer posting checked " + kit.checkedAt.slice(0, 10) : ""}</p>
      </div>
    </header>
    {error && <p className={s.notice} role="alert">Could not approve this draft. Reload, or ask your Claude to revise an over-limit answer.</p>}
    {kit.submission && <section className={ui.panel}>
      <h2>Submission confirmed</h2>
      <p>{kit.submission.date}</p>
      <p className={ui.sub}>{kit.submission.version === null ? "You used different materials." :
        "Reviewed safe content version " + kit.submission.version + " is frozen. This is not a copy of your portal submission."}</p>
      {app.nextAction && <p>{app.nextAction}</p>}
      {(["screening", "interview", "case", "offer", "negotiation"] as const).filter((stage) => canTransition(app.stage, stage)).map((stage) =>
        <form key={stage} action={moveStage.bind(null, id, stage, undefined)}><PendingButton label={"Move to " + stage} /></form>)}
    </section>}
    <p className={ui.panel + " " + s.notice}>Keep personal details and your final CV outside JobSearch.</p>
    <div className={s.split}>
      <div className={s.stack}>
        <section className={ui.panel}>
          <div className={s.inlineHead}>
            <h2>CV content</h2>
            <span className={s.tagline}>{kit.submission ? "Locked" : hasReview ? "Reviewed" : "Review needed"}</span>
          </div>
          {evidenceText ? <ul className={s.kitEvidence}>{kit.evidence.map((code) => <li key={code}>{EVIDENCE_TEXT[code]}</li>)}</ul>
            : <p className={ui.sub}>No verified claims yet.</p>}
          {editable && kit.evidence.length !== record.value.evidence.length && <p className={ui.sub}>Withdrawn claims and drafts relying on them are hidden until you revise this kit.</p>}
          {editable && verified.length > 0 && <ReviewSafeEvidence key={revision} id={id} revision={revision}
            verified={verified} selected={kit.evidence} reviewed={hasReview} />}
          {evidenceText && <div className={s.formFoot + " " + s.kitDownloads}>
            <CopySafeText text={evidenceText} label="Copy content" />
            <a className={ui.btn} href={"/api/export/safe-sourcing/" + id}>Download content</a>
          </div>}
          {editable && <p><a href="/app/settings?section=cv#evidence">Manage verified claims</a></p>}
        </section>
        {(["letter", "answer"] as const).map((section) => {
          const entry = kit[section];
          const request = section === "answer" ? kit.answer?.request : null;
          const prompt = section === "letter" ? "letter" : request?.prompt;
          const text = entry?.draft && prompt ? draftText(entry.draft, prompt) : null;
          const fits = !text || !request || fitsAnswer(text, request);
          const label = section === "letter" ? "Cover letter" : "Portal answers";
          return <details key={section} className={ui.panel + " " + s.kitOptional} open={!!entry}>
            <summary>{label} · Optional <span className={s.tagline}>{!entry ? "Not requested" : !text ? "Requested" : entry.approved ? "Reviewed" : "Draft"}</span></summary>
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
          </details>;
        })}
      </div>
      <aside className={s.stack}>
        <section className={ui.panel}>
          <h2>Employer portal</h2>
          {app.applyUrl && <p><a className={ui.btn} href={app.applyUrl} target="_blank" rel="noreferrer">Open employer posting ↗</a></p>}
          {editable && <ConfirmSafeSubmission key={revision} id={id} revision={revision} today={today} role={app.role}
            company={app.company} hasReview={hasReview} />}
        </section>
        {app.companyId && <section className={ui.panel}>
          <h2>Company research</h2>
          <p className={ui.sub}>{researchStatus}</p>
          <Link href={"/app/companies/" + app.companyId + "?view=research"}>Open {app.company} research</Link>
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
      </aside>
    </div>
  </>;
}
