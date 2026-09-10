import Link from "next/link";
import { Logo } from "./_components/logo";
import styles from "./not-found.module.css";

/**
 * Without this, Next serves its built-in error page - which ships its own
 * prefers-color-scheme block and so renders dark on a system that has
 * committed to light (docs/DESIGN.md section 5).
 */
export default function NotFound() {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand}>
        <Logo size={22} />
        <span className={styles.wordmark}>JobSearch</span>
      </Link>
      <div className={styles.body}>
        <p className={styles.code}>404</p>
        <h1>That page does not exist.</h1>
        <p className={styles.sub}>
          The link may be out of date, or the record may have been removed.
        </p>
        <div className={styles.actions}>
          <Link href="/" className={styles.cta}>
            Back to the start
          </Link>
          <Link href="/app" className={styles.quiet}>
            Go to your pipeline
          </Link>
        </div>
      </div>
    </main>
  );
}
