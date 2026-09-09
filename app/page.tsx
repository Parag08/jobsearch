import Link from "next/link";
import { Logo } from "./_components/logo";
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
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>
          <Logo size={22} />
          <span className={styles.wordmark}>JobSearch</span>
        </span>
        <Link href="/signin" className={styles.signin}>
          Sign in
        </Link>
      </header>

      <div className={styles.hero}>
        <h1>Write your experience down once.</h1>
        <p className={styles.lede}>
          JobSearch tailors a CV and a cover letter to each job from what you have actually done - and
          never claims anything your record cannot back.
        </p>
        <Link href="/signin" className={styles.cta}>
          Get started
        </Link>
      </div>

      <ol className={styles.steps}>
        {STEPS.map((step, i) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.stepNum}>{String(i + 1).padStart(2, "0")}</span>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>

      <section className={styles.honesty}>
        <h2>Nothing on your CV that you cannot back</h2>
        <p>
          Naming a tool, a firm or a method is a claim, and it needs a line of your own experience
          behind it. Where a job asks for something you have not done, the CV stays quiet - and the
          cover letter says so plainly.
        </p>
      </section>

      <footer className={styles.footer}>
        <Logo size={16} />
        <span>JobSearch - a personal job-search operating system.</span>
      </footer>
    </main>
  );
}
