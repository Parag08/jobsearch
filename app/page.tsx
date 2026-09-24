import Link from "next/link";
import { Logo } from "./_components/logo";
import { GlassNav } from "./_components/glass-nav";
import { ThemeToggle } from "./_components/theme-toggle";
import { HeroDemo } from "./_components/hero-demo";
import { ProcessMap } from "./_components/process-map";
import { Reveal } from "./_components/reveal";
import { isSupabaseConfigured } from "@/lib/db";
import styles from "./page.module.css";

// The journey, end to end. Every line here must describe something the app does today -
// what is not built yet lives in COMING, and says so.
const STEPS = [
  {
    title: "Find the roles worth your time",
    body: "Watch the companies you care about. JobSearch reads their own job boards - not aggregators - and brings back their open roles, scored for how well each fits you.",
    ai: "Scored by rules, so it costs nothing to run",
  },
  {
    title: "Paste a job, get it read",
    body: "AI reads each job description once into structure - company, role, seniority, the skills it asks for - and opens an application from it.",
    ai: "AI reads the posting",
  },
  {
    title: "A CV built from your evidence",
    body: "Your CV is assembled from your own bank of experience. Every skill the job asks for is marked as backed or as a gap, so you know exactly what you can claim.",
    ai: "Matched against your record, never invented",
  },
  {
    title: "Track it without the dread",
    body: "Every application, its stage, and the one thing to do next. Anything gone quiet is flagged, and nothing is ever coloured red.",
    ai: "Your pipeline, always current",
  },
  {
    title: "Practise until you are ready",
    body: "Answer behavioural questions out loud and get scored on delivery. Work through live consulting cases with an AI interviewer that pushes back - while the app checks the maths.",
    ai: "AI interviewer and feedback",
  },
];

const COMING = [
  "Networking - reach the people in the office you want, even before a role is posted",
  "Cover letters that speak to the gaps your CV cannot claim",
  "Improvement pointers after a rejection, so the next round starts sharper",
  "Offer comparison and a salary negotiation framework",
];

export default function Home() {
  // The demo workspace only exists when Supabase is unconfigured (lib/db). With it
  // configured, /app redirects a signed-out visitor to /signin - so offering "Demo"
  // in production would be two prominent links that lead nowhere.
  const demoAvailable = !isSupabaseConfigured();

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
        <ThemeToggle />
        {demoAvailable && (
          <Link href="/app" className={styles.navLink}>
            Demo
          </Link>
        )}
        <Link href="/signin" className={styles.navLink}>
          Sign in
        </Link>
        <Link href="/signin" className={styles.navCta}>
          Get started
        </Link>
      </GlassNav>

      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <Reveal delay={0}>
              <p className={styles.eyebrow}>Your job search, end to end</p>
            </Reveal>
            <Reveal delay={80}>
              <h1>From the first search to the final interview.</h1>
            </Reveal>
            <Reveal delay={160}>
              <p className={styles.lede}>
                JobSearch finds the roles, reads each job, builds your CV from what you have actually
                done, tracks every application and rehearses you for the interview - with AI doing the
                heavy lifting, and never claiming anything your record cannot back.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className={styles.ctas}>
                <Link href="/signin" className={styles.cta}>
                  Get started
                </Link>
                {demoAvailable && (
                  <Link href="/app" className={styles.ctaQuiet}>
                    See it with sample data
                  </Link>
                )}
              </div>
              <p className={styles.ctaNote}>Free to start. Continue with Google — no password to make.</p>
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
              <span className={styles.stepAi}>{step.ai}</span>
            </Reveal>
          ))}
        </ol>

        <Reveal as="section" className={styles.honesty}>
          <h2>Nothing on your CV that you cannot back</h2>
          <p>
            Naming a tool, a firm or a method is a claim, and it needs a line of your own experience
            behind it. Where a job asks for something you have not done, the CV stays quiet - and the
            gap is shown to you plainly, so you can address it in your own words.
          </p>
        </Reveal>

        <Reveal as="section" className={styles.coming}>
          <h2>Coming next</h2>
          <ul>
            {COMING.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Reveal>

        <Reveal as="section" className={styles.quiet}>
          <div className={styles.quietItem}>
            <span className={styles.quietNum}>1</span>
            <p>One record. Every CV and interview story is drawn from it, never written around it.</p>
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

        <Reveal as="section" className={styles.process}>
          <h2>The whole search, step by step</h2>
          <p className={styles.processLede}>
            Open any stage to see what happens inside it - and which steps AI does for you.
          </p>
          <ProcessMap />
        </Reveal>

        <Reveal as="footer" className={styles.footer}>
          <Logo size={16} />
          <span>JobSearch - your job search, end to end.</span>
        </Reveal>
      </main>
    </>
  );
}
