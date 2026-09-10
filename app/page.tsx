import Link from "next/link";
import { Logo } from "./_components/logo";
import { GlassNav } from "./_components/glass-nav";
import { HeroDemo } from "./_components/hero-demo";
import { Reveal } from "./_components/reveal";
import styles from "./page.module.css";

const STEPS = [
  {
    title: "Build your record once",
    body: "Upload a CV or your LinkedIn profile, or just talk it through. We ask the follow-up questions that surface the numbers most CVs leave out.",
  },
  {
    title: "Paste a job description",
    body: "Get a CV drawn from your record, and a cover letter that addresses what the CV honestly cannot claim. Download either as PDF or DOCX.",
  },
  {
    title: "Track it without the dread",
    body: "Every application, its stage, and the one thing to do next. Companies you are watching get checked daily against their own job boards.",
  },
  {
    title: "Walk in prepared",
    body: "Rehearse the exact stories behind the CV they read - in your own words, with your own numbers.",
  },
];

export default function Home() {
  return (
    <>
      <div className={styles.ambient} aria-hidden="true" />

      <GlassNav
        brand={
          <>
            <Logo size={22} />
            <span className={styles.wordmark}>JobSearch</span>
          </>
        }
      >
        <Link href="/app" className={styles.navLink}>
          Demo
        </Link>
        <Link href="/signin" className={styles.navCta}>
          Sign in
        </Link>
      </GlassNav>

      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <Reveal delay={0}>
              <p className={styles.eyebrow}>A job-search operating system</p>
            </Reveal>
            <Reveal delay={80}>
              <h1>Write your experience down once.</h1>
            </Reveal>
            <Reveal delay={160}>
              <p className={styles.lede}>
                JobSearch tailors a CV and a cover letter to each job from what you have actually done -
                and never claims anything your record cannot back.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className={styles.ctas}>
                <Link href="/signin" className={styles.cta}>
                  Get started
                </Link>
                <Link href="/app" className={styles.ctaQuiet}>
                  See it with sample data
                </Link>
              </div>
            </Reveal>
          </div>
          <Reveal delay={200} className={styles.heroDemo}>
            <HeroDemo />
          </Reveal>
        </section>

        <ol className={styles.steps}>
          {STEPS.map((step, i) => (
            <Reveal as="li" key={step.title} delay={i * 70} className={styles.step}>
              <span className={styles.stepNum}>{String(i + 1).padStart(2, "0")}</span>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </Reveal>
          ))}
        </ol>

        <Reveal as="section" className={styles.honesty}>
          <h2>Nothing on your CV that you cannot back</h2>
          <p>
            Naming a tool, a firm or a method is a claim, and it needs a line of your own experience
            behind it. Where a job asks for something you have not done, the CV stays quiet - and the
            cover letter says so plainly.
          </p>
        </Reveal>

        <Reveal as="section" className={styles.quiet}>
          <div className={styles.quietItem}>
            <span className={styles.quietNum}>1</span>
            <p>One record. Every CV, letter and interview story is drawn from it, never written around it.</p>
          </div>
          <div className={styles.quietItem}>
            <span className={styles.quietNum}>0</span>
            <p>Red pixels for a rejection. Most applications close; that is arithmetic, not failure, and the interface treats it that way.</p>
          </div>
          <div className={styles.quietItem}>
            <span className={styles.quietNum}>$0</span>
            <p>To run. Free tiers by default, paid pieces opt-in and swappable.</p>
          </div>
        </Reveal>

        <Reveal as="footer" className={styles.footer}>
          <Logo size={16} />
          <span>JobSearch - a personal job-search operating system.</span>
        </Reveal>
      </main>
    </>
  );
}
