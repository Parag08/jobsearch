"use client";

import { useActionState, useState } from "react";
import type { SourcingRecipe } from "@/lib/watchlist/daily";
import { addCompanyWebsite, addTargetCompany, connectTargetBoard, saveEvidence, saveSourcingRecipe } from "./sourcing-actions";
import { Evidence, EVIDENCE_TEXT, type EvidenceCode } from "@/lib/watchlist/safe-kit";
import { PendingButton } from "./sourcing-controls";
import ui from "./ui.module.css";
import s from "./sourcing.module.css";

export function AddTargetForm() {
  const [state, action] = useActionState<{ error?: string }, FormData>(addTargetCompany, {});
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  return (
    <form action={action} className={s.form}>
      <label className={s.field}>Company name
        <input className={ui.input} name="name" placeholder="Example Company" required maxLength={160}
          value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={s.field}>Company website (optional)
        <input className={ui.input} name="website" placeholder="example.com" inputMode="url" maxLength={500}
          value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      <p className={ui.sub}>New companies need source setup. Adding one doesn’t start research or look for people.</p>
      <FormError error={state.error} />
      <div className={s.formFoot}><PendingButton label="Add company" primary /></div>
    </form>
  );
}

export function ConnectBoardForm({ companyId, replaceId }: { companyId: string; replaceId?: string }) {
  const [state, action] = useActionState<{ error?: string }, FormData>(connectTargetBoard.bind(null, companyId, replaceId), {});
  return (
    <form action={action} className={s.form}>
      <label className={s.field}>Public ATS board URL
        <input className={ui.input} name="board" placeholder="https://jobs.lever.co/example" inputMode="url" required maxLength={500} />
      </label>
      <FormError error={state.error} />
      <div><PendingButton label={replaceId ? "Save replacement" : "Connect board"} /></div>
    </form>
  );
}

export function AddCompanyWebsiteForm({ companyId }: { companyId: string }) {
  const [state, action] = useActionState<{ error?: string }, FormData>(addCompanyWebsite.bind(null, companyId), {});
  const [website, setWebsite] = useState("");
  return <form action={action} className={s.form}>
    <label className={s.field}>Public company website
      <input className={ui.input} name="website" required inputMode="url" value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={500} />
    </label>
    <FormError error={state.error} />
    <div><PendingButton label="Save website" /></div>
  </form>;
}

export function RecipeForm({ recipe }: { recipe: SourcingRecipe }) {
  const [state, action] = useActionState<{ error?: string }, FormData>(saveSourcingRecipe, {});
  return (
    <form action={action} className={s.form}>
      <label className={s.field}>Daily target number
        <input className={ui.input} name="target" type="number" min={1} max={2147483647} step={1} defaultValue={recipe.target} required />
      </label>
      <p className={ui.sub}>A maximum, never a quota. If fewer roles match, we’ll show fewer.</p>
      <label className={s.field}>Cities
        <textarea className={ui.input} name="cities" rows={2} defaultValue={recipe.cities.join(", ")} placeholder="Singapore" maxLength={2000} />
      </label>
      <label className={s.field}>Role families
        <textarea className={ui.input} name="titles" rows={2} defaultValue={recipe.titles.join(", ")} placeholder="Product Manager, Chief of Staff" maxLength={2000} />
      </label>
      <label className={s.field}>Titles to skip
        <textarea className={ui.input} name="excluded" rows={2} defaultValue={recipe.excluded.join(", ")} maxLength={2000} />
      </label>
      <p className={ui.sub}>Separate phrases with commas or new lines. Leave a field blank to skip that filter. Don’t include personal eligibility information.</p>
      <FormError error={state.error} />
      <div className={s.formFoot}><PendingButton label="Save preferences" primary /></div>
    </form>
  );
}

function FormError({ error }: { error?: string }) {
  return error ? <p className={s.notice} role="alert">{error}</p> : null;
}

export function EvidenceSettings({ evidence }: { evidence: EvidenceCode[] }) {
  const [state, action] = useActionState<{ error?: string }, FormData>(saveEvidence, {});
  return <form action={action} className={s.form}>
    <fieldset className={s.checks}>
      <legend>Verified claims</legend>
      {Evidence.options.map((code) => <label key={code}><input type="checkbox" name="evidence" value={code}
        defaultChecked={evidence.includes(code)} /> {EVIDENCE_TEXT[code]}</label>)}
    </fieldset>
    <label><input type="checkbox" name="attested" required /> Each selected claim describes work I actually did.</label>
    <FormError error={state.error} />
    <div><PendingButton label="Save verified claims" /></div>
  </form>;
}
