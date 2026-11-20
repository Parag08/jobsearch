"use client";

import { useActionState } from "react";
import { readPostingAction } from "../../actions";
import ui from "../../ui.module.css";
import s from "./application.module.css";

/**
 * An application whose posting isn't read yet (its board gave no text, or the read failed):
 * paste it here, or read the kept text again. On success the page reloads with the CV built.
 */
export function ReadPosting({ applicationId, kept, url }: { applicationId: string; kept: boolean; url: string | null }) {
  const [error, action, pending] = useActionState(readPostingAction.bind(null, applicationId), null);
  return (
    <form action={action} className={s.readPosting}>
      <p className={ui.sub}>
        {kept
          ? "We have the posting but couldn't read it yet. Read it again, or paste a fresh copy."
          : "Its board didn't give us the text. "}
        {!kept && url && (
          <>
            <a href={url} target="_blank" rel="noopener noreferrer" className={ui.textBtn}>
              Open the posting
            </a>
            , copy the whole description and paste it here.
          </>
        )}
        {!kept && !url && "Copy the whole description and paste it here."} We read it once to build your CV.
      </p>
      <textarea
        className={ui.input}
        name="posting"
        rows={kept ? 3 : 7}
        placeholder="Paste the job description: title, company, what you'd do, what they ask for"
        aria-label="Job posting"
      />
      <div className={s.readFoot}>
        {error && (
          <p className={s.readError} role="alert">
            {error}
          </p>
        )}
        <button className={ui.btn} data-primary="" type="submit" disabled={pending}>
          {pending ? "Reading…" : kept ? "Read it" : "Read the posting"}
        </button>
      </div>
    </form>
  );
}
