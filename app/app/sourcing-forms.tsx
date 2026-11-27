"use client";

import { useActionState, useState } from "react";
import { addCompanyWebsite, addTargetCompany, connectTargetBoard } from "./sourcing-actions";
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

function FormError({ error }: { error?: string }) {
  return error ? <p className={s.notice} role="alert">{error}</p> : null;
}
