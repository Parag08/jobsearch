"use client";

import { useActionState } from "react";
import { createFromJd } from "./actions";
import ui from "./ui.module.css";

/**
 * JD intake, the product's front door (DESIGN.md section 2). The action returns
 * an error string rather than throwing, so a missing LLM key or an unparseable
 * posting is explained here instead of showing a crash.
 */
export function JdForm() {
  const [error, action, pending] = useActionState(createFromJd, null);

  return (
    <form action={action} className={ui.stack}>
      <textarea
        className={ui.jd}
        name="jd"
        required
        minLength={40}
        placeholder="Paste the whole job description here. It is parsed once and stored as structure - the raw text never goes into another prompt."
        aria-label="Job description"
      />
      <div className={ui.actions}>
        <button className={ui.btn} data-primary="" type="submit" disabled={pending}>
          {pending ? "Reading the posting…" : "Open an application"}
        </button>
        {error && <span className={ui.warn}>{error}</span>}
      </div>
    </form>
  );
}
