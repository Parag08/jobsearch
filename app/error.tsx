"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "./_components/logo";
import styles from "./not-found.module.css";

/**
 * Catch-all error boundary for everything outside /app, which has its own.
 * Without one, any server-side throw renders Next's unstyled digest page -
 * white, off-brand, and offering the reader nothing to do.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Root error:", error);
  }, [error]);

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand}>
        <Logo size={22} />
        <span className={styles.wordmark}>JobSearch</span>
      </Link>
      <div className={styles.body}>
        <p className={styles.code}>{error.digest ? `error ${error.digest}` : "error"}</p>
        <h1>Something went wrong.</h1>
        <p className={styles.sub}>
          This is usually momentary. Trying again normally works; if it does not, the digest
          above identifies it in the server logs.
        </p>
        <div className={styles.actions}>
          <button className={styles.cta} type="button" onClick={reset}>
            Try again
          </button>
          <Link href="/" className={styles.quiet}>
            Back to the start
          </Link>
        </div>
      </div>
    </main>
  );
}
