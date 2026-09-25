"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./hero-demo.module.css";

/**
 * The hero's live object: one job search, end to end, on a glass card.
 * Sourcing -> Networking -> Applying -> Interview -> Offer, and the loop that
 * makes it a system rather than a tracker: a "not this time" goes round through
 * Improve and back to the start, sharper - then on to the offer.
 *
 * Every frame names who does the work (AI, the app's own rules, or "soon" for
 * what is not built yet) so the sample never promises more than the product
 * does - the same tags as the process map below (app/_components/process-map.tsx).
 * Motion: one spring per step, paused off-screen and under reduced motion.
 */
const STOPS = ["sourcing", "networking", "applying", "interview", "offer"] as const;
type Stop = (typeof STOPS)[number];
type Tag = "ai" | "auto" | "soon";

interface Frame {
  /** Where the ring sits. */
  at: Stop;
  /** The chip: the stage name, or "improve" on the loop. */
  chip: string;
  tag: Tag;
  text: string;
  round: 1 | 2;
  /** The loop arc lights up while the ring travels back to the start. */
  loop?: boolean;
}

const FRAMES: Frame[] = [
  { at: "sourcing", chip: "sourcing", tag: "auto", text: "153 roles on your boards - 12 match you", round: 1 },
  { at: "networking", chip: "networking", tag: "soon", text: "Two alumni in that office - before the role is posted", round: 1 },
  { at: "applying", chip: "applying", tag: "ai", text: "Job read; CV built from 14 points you can back", round: 1 },
  { at: "interview", chip: "interview", tag: "ai", text: "A live case with an AI interviewer - maths checked", round: 1 },
  { at: "sourcing", chip: "improve", tag: "soon", text: "Not this time - three pointers for the next round", round: 1, loop: true },
  { at: "applying", chip: "applying", tag: "ai", text: "Round two: the gaps they probed are now covered", round: 2 },
  { at: "interview", chip: "interview", tag: "ai", text: "Final round, rehearsed in your own words", round: 2 },
  { at: "offer", chip: "offer", tag: "soon", text: "Offer in - weigh it, then negotiate it", round: 2 },
];

const TAG_LABEL: Record<Tag, string> = { ai: "AI", auto: "automatic", soon: "soon" };

/** Stage-scale colour for each chip (docs/DESIGN.md section 5); improve is neutral, never red. */
const CHIP_STAGE: Record<string, string> = {
  sourcing: "saved",
  networking: "applied",
  applying: "screening",
  interview: "interview",
  improve: "closed",
  offer: "offer",
};

export function HeroDemo() {
  const [frame, setFrame] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [running, setRunning] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setRunning(false);
      setFrame(2);
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
    const t = setInterval(() => {
      setFrame((f) => {
        if (f + 1 < FRAMES.length) return f + 1;
        // Wrap: the ring re-mounts at the start (fades in) instead of sliding back
        // across the whole track, which read as a glitch.
        setCycle((c) => c + 1);
        return 0;
      });
    }, 2600);
    return () => clearInterval(t);
  }, [running]);

  // Specular highlight follows the pointer - the "liquid" in liquid glass.
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  }

  const f = FRAMES[frame]!;
  const step = STOPS.indexOf(f.at);

  return (
    <div ref={ref} className={styles.glass} onPointerMove={onMove} aria-label="A sample job search, from sourcing to the offer">
      <div className={styles.sheen} aria-hidden="true" />
      <div className={styles.head}>
        <span className={styles.company}>Your job search, end to end</span>
        <span className={styles.mono}>round {f.round}</span>
      </div>

      <div className={styles.track} data-loop={f.loop ? "" : undefined} aria-hidden="true">
        {/* the loop: from interview back over the top to sourcing */}
        <span className={styles.loop}>
          <span className={styles.loopLabel}>go again, sharper</span>
        </span>
        <ol className={styles.stops}>
          {STOPS.map((s, i) => (
            <li key={s} className={styles.stop} data-active={i === step ? "" : undefined} data-done={i < step ? "" : undefined}>
              <span className={styles.dot} style={{ "--i": i } as React.CSSProperties} />
              <span className={styles.label}>{s}</span>
            </li>
          ))}
        </ol>
        <span key={cycle} className={styles.puck} style={{ "--step": step } as React.CSSProperties} />
      </div>

      <div className={styles.foot} key={frame}>
        <span className={styles.stage} data-stage={CHIP_STAGE[f.chip]}>
          {f.chip}
        </span>
        <span className={styles.tag} data-tag={f.tag}>
          {TAG_LABEL[f.tag]}
        </span>
        <span className={styles.next}>{f.text}</span>
      </div>
    </div>
  );
}
