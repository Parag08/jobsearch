import Link from "next/link";
import { Logo } from "./_components/logo";
import { GlassNav } from "./_components/glass-nav";
import { ThemeToggle } from "./_components/theme-toggle";
import { HeroDemo } from "./_components/hero-demo";
import { ProcessMap } from "./_components/process-map";
import { Reveal } from "./_components/reveal";
import { GoogleButton } from "./_components/google-button";
import { GoogleOneTap } from "./_components/google-one-tap";
import { signInWith } from "./signin/actions";
import { readSupabaseEnv } from "@/lib/db/supabase";
import { readGoogleClientId, shouldOfferOneTap } from "@/lib/auth/google-one-tap";
import styles from "./page.module.css";

// The journey, end to end. Every line here must describe something the app does today -
// what is not built yet lives in COMING, and says so.
const STEPS = [
  {
    title: "Find the roles worth your time",
    body: "Watch the companies you care about. JobSearch checks their own job boards every day and brings back the open roles in your cities and line of work, scored for fit.",
    ai: "Automatic",
  },
  {
    title: "Paste a job posting",
    body: "AI pulls out the company, role, level and the skills it asks for, and opens an application for it.",
    ai: "AI",
  },
  {
    title: "A CV built from your evidence",
    body: "Each CV is built from your own experience. Every skill the job asks for is marked as covered or as a gap, so you know exactly what you can claim.",
    ai: "AI, checked against your experience",
  },
  {
    title: "Track every application",
    body: "See each one's stage and its next step, and get a nudge when one goes quiet. A rejection is never shown in red: most applications close, and that is not failure.",
    ai: "Automatic",
  },
  {
    title: "Practise until you are ready",
    body: "Answer interview questions out loud and get scored on what you said and how you said it. Work through live cases with an AI interviewer that pushes back, while the app checks the maths.",
    ai: "AI",
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
  const supabase = readSupabaseEnv();
  const live = supabase !== null;
  const demoAvailable = !live;
  // Sign in goes straight to Google (the same server action /signin uses) - no detour
  // page. Without Supabase the action could only bounce to /signin, so link there directly.
  const startWithGoogle = signInWith.bind(null, "google");
  const clientId = readGoogleClientId();

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
        {/* One sign-in, not two: Google makes the account on the first visit, so "Sign in"
            and "Get started" were the same action under two names (and the hero's Google
            button a third). The nav keeps one, for readers who have scrolled past the hero. */}
        {live ? (
          <form action={startWithGoogle} className={styles.navForm}>
            <button type="submit" className={styles.navCta}>Sign in</button>
          </form>
        ) : (
          <Link href="/signin" className={styles.navCta}>
            Sign in
          </Link>
        )}
      </GlassNav>

      {supabase && clientId && shouldOfferOneTap({ clientId, supabaseConfigured: live }) && (
        <GoogleOneTap clientId={clientId} supabaseUrl={supabase.url} supabaseKey={supabase.publishableKey} />
      )}

      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <h1>A CV that only says what you can prove.</h1>
            <p className={styles.lede}>
              JobSearch finds roles at the companies you choose, builds each CV from your own
              experience, shows you the gaps honestly, and rehearses you for the interview.
            </p>
            <div className={styles.ctas}>
              {live ? (
                <form action={startWithGoogle}>
                  <GoogleButton label="Continue with Google" />
                </form>
              ) : (
                <Link href="/signin" className={styles.cta}>
                  Get started
                </Link>
              )}
              {demoAvailable && (
                <Link href="/app" className={styles.ctaLink}>
                  See it with sample data
                </Link>
              )}
            </div>
            <p className={styles.ctaNote}>Free. Sign in with Google: no password, and your account is made on the first visit.</p>
          </div>
          {/* The hero text renders at once (a reveal hid it until hydration); the demo card keeps the one entrance. */}
          <Reveal delay={120} className={styles.heroDemo}>
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
