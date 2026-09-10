import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "../_components/logo";
import { getWorkspace } from "@/lib/db";
import { signOut } from "../signin/actions";
import styles from "./app.module.css";

const NAV = [
  ["/app", "Pipeline"],
  ["/app/bank", "Bank"],
  ["/app/watchlist", "Watchlist"],
] as const;

/**
 * The working shell. Same glass nav language as the landing page, quieter:
 * product motion stays at 120ms (docs/DESIGN.md section 5); the marketing
 * springs stop at the door.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const w = await getWorkspace();
  if (!w) redirect("/signin");

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        <nav className={styles.bar} aria-label="App">
          <Link href="/" className={styles.brand}>
            <Logo size={20} />
            <span className={styles.wordmark}>JobSearch</span>
          </Link>
          <div className={styles.links}>
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className={styles.link}>
                {label}
              </Link>
            ))}
          </div>
          <div className={styles.right}>
            <span className={styles.mode} data-mode={w.mode} title={w.mode === "demo" ? "Running on the sample corpus in memory - resets on restart" : w.email ?? ""}>
              {w.mode === "demo" ? "demo workspace" : (w.email ?? "signed in")}
            </span>
            {w.mode === "live" ? (
              <form action={signOut}>
                <button type="submit" className={styles.quiet}>
                  Sign out
                </button>
              </form>
            ) : (
              <Link href="/signin" className={styles.quiet}>
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
