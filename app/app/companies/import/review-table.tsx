"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { ImportOverride, ReviewRow } from "@/lib/companies/import-review";
import ui from "../../ui.module.css";
import s from "../../sourcing.module.css";
import styles from "./import.module.css";

const outcomes: Record<ReviewRow["kind"], string> = {
  new: "New target",
  readd: "Re-add target",
  existing: "Already a target · kept as is",
  repeated: "Repeated in file",
  skipped: "Skipped",
  issue: "Needs attention",
};

export function ReviewTable({ rows, onChange }: {
  rows: ReviewRow[];
  onChange: (number: number, edit: ImportOverride, replace?: boolean) => void;
}) {
  const [edit, setEdit] = useState<ReviewRow>();
  const modal = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    if (edit && !modal.current?.open) modal.current?.showModal();
  }, [edit]);
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!edit) return;
    const data = new FormData(event.currentTarget);
    onChange(edit.number, { name: String(data.get("name")), website: String(data.get("website")), formula: false, skip: false }, true);
    modal.current?.close();
  };

  return <>
    <table className={styles.table} aria-label="Company row review">
      <thead><tr><th scope="col">File row</th><th scope="col">Company name</th><th scope="col">Website</th><th scope="col">Outcome</th><th scope="col">Actions</th></tr></thead>
      <tbody>
        {rows.map((row) => <tr key={row.number}>
          <td data-label="File row">{row.number}</td>
          <td data-label="Company name">{row.name || "—"}</td>
          <td data-label="Website">{row.website || "—"}</td>
          <td data-label="Outcome"><strong data-kind={row.kind}>{outcomes[row.kind]}</strong>
            {row.reason && <div className={styles.muted}>{row.reason}</div>}
            {row.company && <div className={styles.muted}>Existing record: {row.company.name}{row.company.website ? ` · ${row.company.website}` : ""}</div>}
          </td>
          <td className={styles.rowActions}>
            {row.kind === "issue" && <button type="button" className={styles.button} aria-label={`Fix row ${row.number}`} onClick={() => setEdit(row)}>Fix</button>}
            {row.kind === "skipped"
              ? <button type="button" className={styles.button} aria-label={`Include row ${row.number}`} onClick={() => onChange(row.number, { skip: false })}>Include</button>
              : (row.kind === "issue" || row.kind === "new" || row.kind === "readd") &&
                <button type="button" className={styles.button} aria-label={`Skip row ${row.number}`} onClick={() => onChange(row.number, { skip: true })}>Skip</button>}
          </td>
        </tr>)}
      </tbody>
    </table>
    <dialog className={s.dialog} ref={modal} aria-labelledby={heading} onClose={() => setEdit(undefined)}>
      {edit && <>
        <h2 id={heading}>Fix file row {edit.number}</h2>
        <p className={styles.muted}>{edit.reason} Changes apply only to this preview.</p>
        <form className={s.form} key={edit.number} onSubmit={save}>
          <label className={s.field}>Company name
            <input className={ui.input} name="name" defaultValue={edit.name} required />
          </label>
          <label className={s.field}>Company website · optional
            <input className={ui.input} name="website" defaultValue={edit.website} />
          </label>
          {edit.matches.length > 0 && <fieldset className={s.checks}>
            <legend>Link to a company without overwriting it</legend>
            {edit.matches.map((company) => <button key={company.id} type="button" className={styles.button}
              onClick={() => { onChange(edit.number, { linkId: company.id, skip: false }); modal.current?.close(); }}>
              Use {company.name}{company.website ? ` · ${company.website}` : ""}
            </button>)}
          </fieldset>}
          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={() => modal.current?.close()}>Cancel</button>
            <button type="submit" className={styles.button} data-primary>Save row</button>
          </div>
        </form>
      </>}
    </dialog>
  </>;
}
