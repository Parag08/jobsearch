"use client";

import { useTransition } from "react";
import { saveToPipelineAction } from "../actions";
import s from "./watchlist.module.css";

/**
 * Apply (docs/APPLY-FLOW.md steps 3-5): opens the role as an application, with its posting read
 * and CV built, and goes there. That takes a few seconds, so the button says "Preparing…".
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
      {pending ? "Preparing…" : "Apply"}
    </button>
  );
}
