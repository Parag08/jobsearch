"use client";

import { useActionState, useState } from "react";
import { EVIDENCE_TEXT, PROMPTS, Prompt, type EvidenceCode } from "@/lib/watchlist/safe-kit";
import { confirmManualSubmission, requestDraft, saveKitEvidence } from "../../sourcing-actions";
import { PendingButton, SourcingDialog } from "../../sourcing-controls";
import ui from "../../ui.module.css";
import s from "../../sourcing.module.css";

export function ReviewSafeEvidence({ id, revision, selected, verified, reviewed }: {
  id: string; revision: number; selected: EvidenceCode[]; verified: EvidenceCode[]; reviewed: boolean;
}) {
  const [state, action] = useActionState(saveKitEvidence.bind(null, id, revision), {});
  const [choices, setChoices] = useState(selected.filter((code) => verified.includes(code)));
  const same = choices.length === selected.length && choices.every((code) => selected.includes(code));
  return <form action={action} className={s.form + " " + s.kitReview}>
    <details><summary>Edit selected claims</summary><fieldset className={s.checks}>
      <legend>Choose up to three verified claims</legend>
      {verified.map((code) => <label key={code}>
        <input type="checkbox" name="evidence" value={code} checked={choices.includes(code)}
          disabled={!choices.includes(code) && choices.length >= 3}
          onChange={(e) => setChoices(e.target.checked ? [...choices, code] : choices.filter((c) => c !== code))} />
        {" "}{EVIDENCE_TEXT[code]}
      </label>)}
    </fieldset></details>
    {same && choices.length > 0 ? <label>
      <input type="checkbox" name="reviewed" defaultChecked={reviewed} /> I reviewed the exact content shown above.
    </label> : <p className={ui.sub}>Save your changes before reviewing the new content.</p>}
    {state.error && <p className={s.notice} role="alert">{state.error}</p>}
    <div><PendingButton label={same ? "Save review" : "Save CV choices"} primary /></div>
  </form>;
}

export function RequestSafeDraft({ id, section, disabled, revise = false }: {
  id: string; section: "letter" | "answer"; disabled: boolean; revise?: boolean;
}) {
  const [state, action] = useActionState(requestDraft.bind(null, id, section), {});
  return <form action={action} className={s.form}>
    {section === "answer" && <>
      <label className={s.field} htmlFor="safe-question">Non-personal question</label>
      <select id="safe-question" name="prompt" className={ui.input} required>
        {Prompt.options.map((key) => <option key={key} value={key}>{PROMPTS[key]}</option>)}
      </select>
      <div className={s.inlineHead}>
        <label className={s.field}>Maximum
          <input name="limit" className={ui.input} type="number" min={1} max={10000} required />
        </label>
        <label className={s.field}>Unit
          <select name="unit" className={ui.input}><option value="words">Words</option><option value="characters">Characters</option></select>
        </label>
    </div>
    </>}
    {state.error && <p className={s.notice} role="alert">{state.error}</p>}
    <div><PendingButton label={revise ? "Update answer request" : section === "letter" ? "Ask my Claude for a letter" : "Ask my Claude for an answer"} disabled={disabled} /></div>
  </form>;
}

export function ConfirmSafeSubmission({ id, role, company, revision, today, hasReview }: {
  id: string; role: string; company: string; revision: number; today: string; hasReview: boolean;
}) {
  const [state, action] = useActionState<{ error?: string }, FormData>(confirmManualSubmission.bind(null, id, revision), {});
  const [date, setDate] = useState("");
  const [materials, setMaterials] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return <SourcingDialog title="Confirm actual submission" trigger="Confirm submission">
    <div className={s.stack}>
      <p><strong>{role}</strong> · {company}</p>
      <p className={ui.sub}>Only confirm after the employer portal accepted your application. Do not upload a receipt or personal documents.</p>
      <form action={action} className={s.form}>
        <label className={s.field}>Submission date
          <input name="date" className={ui.input} type="date" max={today} required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <fieldset className={s.checks}>
          <legend>Which materials did you use?</legend>
          <label><input type="radio" name="materials" value="reviewed" required disabled={!hasReview}
            checked={materials === "reviewed"} onChange={() => setMaterials("reviewed")} /> Reviewed PII-free content (version {revision})</label>
          <label><input type="radio" name="materials" value="different" required
            checked={materials === "different"} onChange={() => setMaterials("different")} /> Different materials</label>
        </fieldset>
        <label><input type="checkbox" name="confirmed" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} required /> The employer portal showed submission confirmation.</label>
        {state.error && <p className={s.notice} role="alert">{state.error}</p>}
        <div><PendingButton label="Confirm and mark Applied" primary /></div>
      </form>
    </div>
  </SourcingDialog>;
}
