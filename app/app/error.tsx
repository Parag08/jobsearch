"use client";

import { useEffect } from "react";
import ui from "./ui.module.css";

/**
 * Error boundary for the signed-in surfaces. Scoped to /app rather than the root so
 * the nav survives and you can move to another page instead of being thrown out.
 *
 * Most failures here are transient and database-shaped: an expired or clock-skewed
 * session JWT, a paused Supabase project, a board that timed out. Retrying is usually
 * the correct action, so `reset()` is the primary button - without this boundary a
 * momentary failure renders Next's bare digest page, which offers no way forward at all.
 *
 * In production Next redacts the message and passes only `digest`; that is what to quote
 * when searching the logs, so it is shown rather than hidden.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("App route error:", error);
  }, [error]);

  return (
    <section className={ui.panel}>
      <h2>That did not load</h2>
      <p className={ui.sub}>
        Something went wrong fetching your workspace. This is usually momentary — a session
        token that needs refreshing, or the database briefly unreachable. Trying again
        normally works.
      </p>
      <div className={ui.actions}>
        <button className={ui.btn} data-primary="" type="button" onClick={reset}>
          Try again
        </button>
        <a className={ui.btn} href="/app">
          Back to pipeline
        </a>
      </div>
      {error.digest && (
        <p className={ui.sub}>
          If it keeps happening, quote this when checking the logs:{" "}
          <span className={ui.mono}>{error.digest}</span>
        </p>
      )}
    </section>
  );
}
