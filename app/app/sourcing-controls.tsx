"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import ui from "./ui.module.css";
import s from "./sourcing.module.css";

export function PendingButton({ label, pending: pendingLabel, primary, disabled, pressed, ariaLabel }: {
  label: string; pending?: string; primary?: boolean; disabled?: boolean; pressed?: boolean; ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={ui.btn + " " + s.control} type="submit" disabled={disabled || pending}
      data-primary={primary || pressed ? "" : undefined} aria-pressed={pressed} aria-label={ariaLabel}>
      {pending ? pendingLabel ?? "Saving…" : label}
    </button>
  );
}

export function SourcingDialog({ trigger, triggerLabel, title, primary, children }: {
  trigger: string; triggerLabel?: string; title: string; primary?: boolean; children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  return <>
    <button type="button" className={ui.btn + " " + s.control} data-primary={primary ? "" : undefined} aria-label={triggerLabel}
      onClick={() => dialog.current?.showModal()}>{trigger}</button>
    <dialog className={s.dialog} aria-labelledby={heading} ref={dialog}>
      <div className={s.inlineHead}>
        <h2 id={heading}>{title}</h2>
        <button className={ui.btn + " " + s.control} type="button" onClick={() => dialog.current?.close()}>Close</button>
      </div>
      {children}
    </dialog>
  </>;
}
