"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createFromJd } from "./actions";
import ui from "./ui.module.css";

/** Other "add a job" buttons on the page (the board's ghost button) open the one sheet. */
const OPEN_EVENT = "jobsearch:add-job";

export function AddJobGhost() {
  return (
    <button type="button" className={ui.ghostAdd} onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      <span aria-hidden="true">+</span> Add a job
    </button>
  );
}

/**
 * Adding a job, the product's front door (DESIGN.md section 2). It is the pipeline's one
 * primary action, so it lives in the header as a button; the paste box opens under it,
 * growing from the button's corner, and closes faster than it opens. An empty pipeline
 * opens it straight away: an empty screen is an invitation to act.
 *
 * The action returns an error string rather than throwing, so a missing LLM key or an
 * unparseable posting is explained here instead of showing a crash.
 */
export function AddJob({ openFirst = false }: { openFirst?: boolean }) {
  const [open, setOpen] = useState(openFirst);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      wrap.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);
  const [error, action, pending] = useActionState(createFromJd, null);
  const panelId = useId();
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !pending && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  return (
    <div className={ui.addJob} ref={wrap}>
      <button
        type="button"
        className={ui.btn}
        data-primary=""
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        Add a job
      </button>
      <form id={panelId} action={action} className={ui.addJobPanel} data-open={open ? "" : undefined} aria-hidden={!open} inert={!open}>
        <label className={ui.fieldLabel} htmlFor={`${panelId}-jd`}>
          Job posting
        </label>
        <textarea
          id={`${panelId}-jd`}
          ref={box}
          className={ui.jd}
          name="jd"
          required
          minLength={40}
          placeholder="Paste the full job posting"
        />
        <p className={ui.hint}>We pull out the company, role and skills and add it to your pipeline as saved.</p>
        <div className={ui.actions}>
          <button className={ui.btn} data-primary="" type="submit" disabled={pending}>
            {pending ? "Reading the posting…" : "Add to pipeline"}
          </button>
          <button className={ui.btn} type="button" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </button>
          {error && <span className={ui.warn}>{error}</span>}
        </div>
      </form>
    </div>
  );
}
