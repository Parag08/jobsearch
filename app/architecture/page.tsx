import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "../_components/logo";
import { GlassNav } from "../_components/glass-nav";
import { ThemeToggle } from "../_components/theme-toggle";
import { ArchitectureScene } from "./architecture-scene";
import styles from "./architecture.module.css";

export const metadata: Metadata = {
  title: "Architecture - JobSearch",
  description: "How JobSearch works, one flow at a time: a small 3D diagram for each thing the app does.",
};

/**
 * The system architecture, today and planned. Public and static: it reads no user data.
 * The diagram's content is lib/architecture/graph.ts; the reasoning is docs/ARCHITECTURE.md.
 */
export default function ArchitecturePage() {
  return (
    <>
      <GlassNav
        brand={
          <>
            <Logo size={22} />
            <span className={styles.wordmark}>JobSearch</span>
          </>
        }
      >
        <ThemeToggle />
        <Link href="/" className={styles.navLink}>
          Home
        </Link>
      </GlassNav>

      <main className={styles.page}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>Architecture</p>
          <h1>How it works, one flow at a time</h1>
          <p>
            Pick something the app does. You get a small diagram of just the parts involved, and it walks you through what happens,
            step by step. The whole system is the last choice, for when the pieces already make sense.
          </p>
        </header>

        <ArchitectureScene />

        <section className={styles.notes} aria-label="Design rules">
          <div>
            <h2>Rules before models</h2>
            <p>
              A posting is read by a model once and stored as structure. Matching, scoring, selection and page fit are code, so most
              of a cycle costs no tokens, and every model call is logged.
            </p>
          </div>
          <div>
            <h2>Vendors stay at the edge</h2>
            <p>
              Only the adapters know Supabase, a model provider or a job board. Swapping one is a configuration change, and the app
              runs as a demo with no database at all.
            </p>
          </div>
          <div>
            <h2>The honesty rule is in the code</h2>
            <p>
              A CV never mirrors a keyword unless a bullet in your bank evidences it. That check sits in the pure layer, under
              every path that produces a document.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
