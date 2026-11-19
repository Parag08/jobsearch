"use client";

import { useActionState } from "react";
import { createTokenAction, type NewTokenState } from "./actions";
import { DEFAULT_TOKEN_DAYS, TOKEN_LIFETIME_DAYS } from "@/lib/agent/token-options";
import ui from "../ui.module.css";

/** Create a token and show it once. Nothing here keeps it: leaving the page loses it for good. */
export function TokenForm() {
  const [state, action, pending] = useActionState<NewTokenState | null, FormData>(createTokenAction, null);

  return (
    <>
      <form action={action} className={ui.form}>
        <input name="name" className={ui.input} placeholder="What will use it (e.g. Claude on my laptop)" maxLength={60} aria-label="Key name" />
        <select name="scope" className={ui.input} defaultValue="write" aria-label="What the key may do">
          <option value="write">Read and update</option>
          <option value="read">Read only</option>
        </select>
        <select name="days" className={ui.input} defaultValue={String(DEFAULT_TOKEN_DAYS)} aria-label="Expires after">
          {TOKEN_LIFETIME_DAYS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
        <button type="submit" className={ui.btn} disabled={pending}>
          {pending ? "Creating…" : "Create key"}
        </button>
      </form>
      {state?.error && <p className={ui.sub}>{state.error}</p>}
      {state?.token && (
        <div role="status">
          <p className={ui.sub}>Copy this now. It&apos;s shown once and isn&apos;t stored; if you lose it, revoke it and make another.</p>
          <pre className={ui.code} data-testid="new-token" style={{ userSelect: "all", overflowX: "auto" }}>
            {state.token}
          </pre>
        </div>
      )}
    </>
  );
}
