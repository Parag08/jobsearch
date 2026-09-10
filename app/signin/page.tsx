import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "../_components/logo";
import { isSupabaseConfigured } from "@/lib/db";
import { signInWith } from "./actions";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Get started - JobSearch" };

/** Friendly text for the codes the callback and the action can redirect with. */
function explain(code: string): string {
  if (code === "not_configured") return "Sign-in is not connected yet.";
  if (code === "missing_code") return "The sign-in did not come back with a code. Please try again.";
  if (code === "no_redirect_url") return "Could not reach Google. Please try again.";
  return "Sign-in did not complete. Please try again.";
}

/**
 * Onboarding screen 0 (docs/ONBOARDING.md). One provider: Google. OAuth has no
 * separate signup route - the same button creates an account or signs you in -
 * so the copy has to carry that, or a new visitor never learns they can join.
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
        <div className={styles.intro}>
          <h1>Get started</h1>
          <p className={styles.sub}>
            Continuing with Google creates your account if you do not have one yet, and signs you in if
            you do.
          </p>
        </div>

        <form action={signInWith.bind(null, "google")}>
          <button type="submit" className={styles.provider} disabled={!live}>
            Continue with Google
          </button>
        </form>

        {!live && (
          <p className={styles.pending}>
            Sign-in is not connected yet. Meanwhile, <Link href="/app">open the demo workspace</Link>.
          </p>
        )}
        {error && <p className={styles.pending}>{explain(error)}</p>}

        <p className={styles.note}>
          Next we help you build your record — bring a CV, a LinkedIn PDF, or just talk it through. We
          only ever put things on your CV that your own record can back.
        </p>

        <Link href="/" className={styles.back}>
          Back
        </Link>
      </div>
    </main>
  );
}
