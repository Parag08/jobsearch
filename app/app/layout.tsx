import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "../_components/logo";
import { getWorkspace } from "@/lib/db";
import { signOut } from "../signin/actions";
import { ThemeToggle } from "../_components/theme-toggle";
import { BrandLink, NavLinks } from "./nav-links";
import styles from "./app.module.css";

/**
 * The day's order first (what to do next, your applications, practice), then the tools that
 * feed them: find roles, see what they ask for, your evidence, and setup last. On wide
 * screens the JobSearch name is the Overview tab; the phone menu lists Overview by name.
 */
const NAV = [
  ["/app/home", "Overview"],
  ["/app", "Pipeline"],
  ["/app/interview", "Interview"],
  ["/app/watchlist", "Watchlist"],
  ["/app/network", "Network"],
  ["/app/insights", "Insights"],
  ["/app/bank", "Experience"],
  ["/app/agent", "Assistant"],
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
          <BrandLink>
            <Logo size={20} />
            <span className={styles.wordmark}>JobSearch</span>
          </BrandLink>
          <NavLinks items={NAV} />
          <div className={styles.right}>
            <ThemeToggle />
            <span className={styles.mode} data-mode={w.mode} title={w.cannedAi ? "A fictional person's workspace. Your changes last two idle hours." : w.mode === "demo" ? "You're looking at sample data. Changes reset when the server restarts." : w.email ?? ""}>
              {w.mode === "demo" ? "Sample data" : (w.email ?? "Signed in")}
            </span>
            {w.cannedAi ? null : w.mode === "live" ? (
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
      {w.cannedAi && (
        <aside className={styles.demoBar} aria-label="Demo">
          <p>
            <strong>You&apos;re trying JobSearch with a made-up person, Maya.</strong> Click anything: AI answers are
            pre-written, and your changes last two idle hours.
          </p>
          <div className={styles.demoActions}>
            <Link href="/signin" className={styles.demoCta}>
              Start your own
            </Link>
            <form action="/demo/exit" method="post">
              <button type="submit" className={styles.quiet}>
                Leave demo
              </button>
            </form>
          </div>
        </aside>
      )}
      <main className={styles.main}>{children}</main>
    </div>
  );
}
