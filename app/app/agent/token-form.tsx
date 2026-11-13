"use client";

import { useActionState } from "react";
import { createTokenAction, type NewTokenState } from "./actions";
import ui from "../ui.module.css";

/** Create a token and show it once. Nothing here keeps it: leaving the page loses it for good. */
export function TokenForm() {
  const [state, action, pending] = useActionState<NewTokenState | null, FormData>(createTokenAction, null);

  return (
    <>
      <form action={action} className={ui.form}>
        <input name="name" className={ui.input} placeholder="What will use it (e.g. Claude on my laptop)" maxLength={60} aria-label="Token name" />
        <button type="submit" className={ui.btn} disabled={pending}>
          {pending ? "Creating…" : "Create token"}
        </button>
      </form>
      {state?.error && <p className={ui.sub}>{state.error}</p>}
      {state?.token && (
        <div role="status">
          <p className={ui.sub}>Copy this now. It is shown once and is not stored; if you lose it, revoke it and make another.</p>
          <pre className={ui.mono} data-testid="new-token" style={{ userSelect: "all", overflowX: "auto" }}>
            {state.token}
          </pre>
        </div>
      )}
    </>
  );
}
