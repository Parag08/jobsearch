"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./hero-demo.module.css";

/**
 * The hero's live object: one application moving through the pipeline on a
 * glass card. It teaches the interface before the user signs in - the stage
 * scale (docs/DESIGN.md section 5) deepens as the card advances, closed is
 * neutral, nothing is red. Motion is a single spring per step, iPhone-like:
 * fast out, soft landing. Paused under prefers-reduced-motion and when the
 * card is off-screen.
 */
const STAGES = ["saved", "applied", "screening", "interview", "offer"] as const;

const NEXT_ACTION: Record<(typeof STAGES)[number], string> = {
  saved: "Tailor CV from the product master",
  applied: "Follow up in 14 days if silent",
  screening: "Confirm the two numbers they will ask about",
  interview: "Rehearse the payments story, in your words",
  offer: "Compare against the target you set on day one",
};

export function HeroDemo() {
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setRunning(false);
      setStep(3);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setRunning(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setStep((s) => (s + 1) % STAGES.length), 2600);
    return () => clearInterval(t);
  }, [running]);

  // Specular highlight follows the pointer - the "liquid" in liquid glass.
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  }

  const stage = STAGES[step];

  return (
    <div ref={ref} className={styles.glass} onPointerMove={onMove} aria-label="A sample application moving through the pipeline">
      <div className={styles.sheen} aria-hidden="true" />
      <div className={styles.head}>
        <span className={styles.company}>Product Manager, Payments</span>
        <span className={styles.mono}>SGP · EP sponsored</span>
      </div>

      <ol className={styles.track} aria-hidden="true">
        {STAGES.map((s, i) => (
          <li key={s} className={styles.stop} data-active={i === step ? "" : undefined} data-done={i < step ? "" : undefined}>
            <span className={styles.dot} style={{ "--i": i } as React.CSSProperties} />
            <span className={styles.label}>{s}</span>
          </li>
        ))}
        <span className={styles.puck} style={{ "--step": step } as React.CSSProperties} />
      </ol>

      <div className={styles.foot} key={stage}>
        <span className={styles.stage} data-stage={stage}>
          {stage}
        </span>
        <span className={styles.next}>{NEXT_ACTION[stage]}</span>
      </div>
    </div>
  );
}
