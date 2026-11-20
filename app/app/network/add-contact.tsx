"use client";

import { useActionState } from "react";
import { addContactAction } from "./actions";
import ui from "../ui.module.css";
import s from "./network.module.css";

/**
 * Add a person by name, or by pasting their LinkedIn link (the name is read from the link;
 * the page is never fetched). Errors come back as a sentence under the form.
 */
export function AddContact({ company }: { company?: string }) {
  const [state, action, pending] = useActionState(addContactAction, null);
  const v = state?.values;
  return (
    // A failed add remounts the form with what was typed (React clears it after the action).
    <form action={action} className={s.addForm} key={state ? JSON.stringify(v) : "blank"}>
      <label className={s.field} data-wide="">
        <span>Name or LinkedIn link</span>
        <input className={ui.input} name="name" defaultValue={v?.name} placeholder="Priya Raman, or linkedin.com/in/…" autoComplete="off" />
      </label>
      <label className={s.field}>
        <span>Company</span>
        <input className={ui.input} name="company" defaultValue={v?.company ?? company ?? ""} placeholder="Where they work" />
      </label>
      <label className={s.field}>
        <span>Role</span>
        <input className={ui.input} name="role" defaultValue={v?.role} placeholder="Their title" />
      </label>
      <label className={s.field}>
        <span>How you know them</span>
        <input className={ui.input} name="how" defaultValue={v?.how} placeholder="School, past firm, a meetup" />
      </label>
      <label className={s.field}>
        <span>Warmth</span>
        <select className={ui.input} name="warmth" defaultValue={v?.warmth || "cold"}>
          <option value="cold">Cold · follow up in 2 weeks</option>
          <option value="warm">Warm · in a week</option>
          <option value="hot">Hot · in 3 days</option>
        </select>
      </label>
      <label className={s.field} data-wide="">
        <span>LinkedIn link (optional)</span>
        <input className={ui.input} name="linkedin" defaultValue={v?.linkedin} placeholder="https://www.linkedin.com/in/…" autoComplete="off" />
      </label>
      <div className={s.formFoot}>
        {state && (
          <p className={s.error} role="alert">
            {state.error}
          </p>
        )}
        <button className={ui.btn} data-primary="" type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add person"}
        </button>
      </div>
    </form>
  );
}
