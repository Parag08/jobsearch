import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "../_components/logo";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Sign in - JobSearch" };

/**
 * Onboarding screen 0 (docs/ONBOARDING.md). The providers are inert until
 * Supabase auth is connected - they are disabled rather than silently doing
 * nothing, so the page never pretends to work.
 */
export default function SignIn() {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand}>
        <Logo size={22} />
        <span className={styles.wordmark}>JobSearch</span>
      </Link>

      <div className={styles.panel}>
        <h1>Sign in</h1>

        <div className={styles.providers}>
          <button type="button" className={styles.provider} disabled>
            Continue with Google
          </button>
          <button type="button" className={styles.provider} disabled>
            Continue with LinkedIn
          </button>
        </div>

        <p className={styles.pending}>Sign-in connects once Supabase auth is wired.</p>

        <p className={styles.note}>
          Signing in with LinkedIn gets you in the door. It does not import your history - we ask for
          that next, and you can bring a CV, a LinkedIn PDF, or just talk it through.
        </p>

        <Link href="/" className={styles.back}>
          Back
        </Link>
      </div>
    </main>
  );
}
