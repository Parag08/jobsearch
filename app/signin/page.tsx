import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "../_components/logo";
import { isSupabaseConfigured } from "@/lib/db";
import { signInWith } from "./actions";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Sign in - JobSearch" };

/**
 * Onboarding screen 0 (docs/ONBOARDING.md). With Supabase configured the
 * providers are live; without it they are disabled rather than silently
 * inert, and the demo workspace is offered instead.
 */
export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const live = isSupabaseConfigured();
  const { error } = await searchParams;

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand}>
        <Logo size={22} />
        <span className={styles.wordmark}>JobSearch</span>
      </Link>

      <div className={styles.panel}>
        <h1>Sign in</h1>

        <div className={styles.providers}>
          <form action={signInWith.bind(null, "google")}>
            <button type="submit" className={styles.provider} disabled={!live}>
              Continue with Google
            </button>
          </form>
          <form action={signInWith.bind(null, "linkedin_oidc")}>
            <button type="submit" className={styles.provider} disabled={!live}>
              Continue with LinkedIn
            </button>
          </form>
        </div>

        {!live && (
          <p className={styles.pending}>
            Sign-in connects once Supabase is configured. Meanwhile, <Link href="/app">open the demo workspace</Link>.
          </p>
        )}
        {error && <p className={styles.pending}>Sign-in did not complete ({error}). Try again.</p>}

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
