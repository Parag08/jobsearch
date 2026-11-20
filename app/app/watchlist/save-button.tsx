"use client";

import { useTransition } from "react";
import { saveToPipelineAction } from "../actions";
import s from "./watchlist.module.css";

/**
 * Save to pipeline (docs/APPLY-FLOW.md step 3). Reading the posting and building the CV take a
 * few seconds, so the button says "Saving…" until the action redirects back to this row.
 */
export function SaveToPipelineButton({ jobId, label }: { jobId: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={s.save}
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={label}
      onClick={() => start(() => saveToPipelineAction(jobId))}
    >
      {pending ? "Saving…" : "Save to pipeline"}
    </button>
  );
}
