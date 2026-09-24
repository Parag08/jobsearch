"use client";

import { useState } from "react";
import styles from "./process-map.module.css";

/**
 * The whole job search as one loop (landing page):
 *
 *   Sourcing -> Networking -> Applying -> Interview prep -> Offer & negotiation
 *      ^                                        |
 *      +---------- Improve <---- not this time -+
 *
 * Each stage opens to show the steps inside it, and every step says who does
 * the work: AI, the app's own rules, or you. Anything not built yet is marked
 * "coming" - the honesty rule applies to the marketing page too.
 */
type Kind = "ai" | "auto" | "you";
type Step = { name: string; detail: string; kind: Kind; coming?: boolean };
type Stage = { id: string; num: string; title: string; summary: string; steps: Step[] };

const SOURCING: Stage = {
  id: "sourcing",
  num: "01",
  title: "Sourcing",
  summary: "Every open role, narrowed to the ones that match you",
  steps: [
    { name: "Choose the companies to watch", detail: "Pick the firms you want; the app knows which job-board system each one runs on.", kind: "you" },
    { name: "Pull every open role", detail: "Straight from each company's own job board, not an aggregator.", kind: "auto" },
    { name: "Keep the ones that match", detail: "Filtered to your city and your line of work, so the list is short enough to read.", kind: "auto", coming: true },
    { name: "Score each role for fit", detail: "Sector, skill overlap, network and location - scored by rules, without spending a token.", kind: "auto" },
    { name: "Explain why a role fits you", detail: "A two-line case for each match, drawn from your own record.", kind: "ai", coming: true },
    { name: "Retire roles that close", detail: "Postings that vanish from a board leave your list on their own.", kind: "auto", coming: true },
  ],
};

const NETWORKING: Stage = {
  id: "networking",
  num: "02",
  title: "Networking",
  summary: "Talk to the people in that office - even before the role is posted",
  steps: [
    { name: "Find the people who work there", detail: "Alumni and contacts at the firms you are watching, in the office you want.", kind: "auto", coming: true },
    { name: "Draft the first message", detail: "Short and specific, in your voice, grounded in your record.", kind: "ai", coming: true },
    { name: "Have the conversation", detail: "A coffee chat before there is a posting is worth more than an application after it.", kind: "you" },
    { name: "Keep every conversation", detail: "Who you spoke to, what you learned, and when to follow up.", kind: "auto", coming: true },
    { name: "Ask for the referral", detail: "When the role opens, you already know who to ask.", kind: "you" },
  ],
};

const APPLYING: Stage = {
  id: "applying",
  num: "03",
  title: "Applying",
  summary: "An honest CV and cover letter for this job",
  steps: [
    { name: "Paste the job description", detail: "The whole posting, as it is.", kind: "you" },
    { name: "Read it into structure", detail: "Company, role, seniority and the skills asked for - extracted once and stored.", kind: "ai" },
    { name: "Match the job to your evidence", detail: "Each skill the job asks for is marked as backed by your record, or as a gap.", kind: "auto" },
    { name: "Tailor the CV", detail: "Drawn from your master CV - lines added or swapped, never invented.", kind: "auto" },
    { name: "Draft the cover letter", detail: "Written around the gaps the CV honestly cannot claim.", kind: "ai", coming: true },
    { name: "Send it and mark it applied", detail: "The exact CV you sent is frozen, so you always know what they read.", kind: "you" },
    { name: "Flag applications gone quiet", detail: "Anything silent for 14 days is flagged, so nothing slips.", kind: "auto" },
  ],
};

const INTERVIEW: Stage = {
  id: "interview",
  num: "04",
  title: "Interview prep",
  summary: "Practise until you are ready",
  steps: [
    { name: "Work the question bank", detail: "The behavioural questions top firms ask, with what a strong answer shows.", kind: "you" },
    { name: "Write your answer", detail: "A blank page or STAR - both drafts are kept.", kind: "you" },
    { name: "Say it out loud", detail: "The question is read aloud and your answer transcribed as you speak.", kind: "auto" },
    { name: "Get feedback on delivery", detail: "Pace, structure and numbers are measured; AI judges the rest.", kind: "ai" },
    { name: "Run a live case", detail: "An AI interviewer leads a full consulting case and pushes back, while the app checks the maths.", kind: "ai" },
    { name: "Prep for this exact application", detail: "Questions and stories chosen for the role and the CV you actually sent.", kind: "ai", coming: true },
  ],
};

const IMPROVE: Stage = {
  id: "improve",
  num: "05",
  title: "Improve",
  summary: "Not this time - learn from it, and go again",
  steps: [
    { name: "Log what happened", detail: "Close the application at the stage it reached. Closed is grey, never red.", kind: "you" },
    { name: "Find the pattern", detail: "Read across every outcome to see where applications stall - CV, screen, case or fit.", kind: "ai", coming: true },
    { name: "Get improvement pointers", detail: "Concrete changes to your CV, stories or case approach, drawn from that pattern.", kind: "ai", coming: true },
    { name: "Drill your weakest area", detail: "Practice aimed at the dimension your interview scores are lowest on.", kind: "auto", coming: true },
    { name: "Back to sourcing, sharper", detail: "The lessons go into your record, and the next search starts from a better place.", kind: "you" },
  ],
};

const OFFER: Stage = {
  id: "offer",
  num: "06",
  title: "Offer & negotiation",
  summary: "Weigh the offer, then negotiate it",
  steps: [
    { name: "Compare against your target", detail: "The offer, set against what you decided you wanted on day one.", kind: "you", coming: true },
    { name: "Plan the negotiation", detail: "A structured salary negotiation framework - arriving soon.", kind: "you", coming: true },
    { name: "Rehearse the conversation", detail: "Practise the call with an AI counterpart before you have it for real.", kind: "ai", coming: true },
  ],
};

const STAGES = [SOURCING, NETWORKING, APPLYING, INTERVIEW, IMPROVE, OFFER];

const KIND_LABEL: Record<Kind, string> = { ai: "AI", auto: "Automatic", you: "You" };

/** "live" when AI already does a step here; "soon" when its only AI steps are not built yet. */
function aiState(s: Stage): "live" | "soon" | null {
  const ai = s.steps.filter((x) => x.kind === "ai");
  if (ai.some((x) => !x.coming)) return "live";
  return ai.length ? "soon" : null;
}

function Arrow({ label }: { label?: string }) {
  return (
    <span className={styles.arrow} aria-hidden="true">
      {label && <span className={styles.arrowLabel}>{label}</span>}
      <svg className={styles.arrowSvg} viewBox="0 0 24 12" width="24" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 6h21M17 1.5 22 6l-5 4.5" />
      </svg>
    </span>
  );
}

function Panel({ stage }: { stage: Stage }) {
  return (
    <div className={styles.panel}>
      <p className={styles.panelHead}>
        <span className={styles.panelTitle}>{stage.title}</span>
        <span className={styles.panelSummary}>{stage.summary}</span>
      </p>
      <ol className={styles.steps}>
        {stage.steps.map((st) => (
          <li key={st.name} className={styles.step} data-kind={st.kind} data-coming={st.coming ? "" : undefined}>
            <span className={styles.stepName}>{st.name}</span>
            <span className={styles.tags}>
              <span className={styles.kind} data-kind={st.kind}>
                {KIND_LABEL[st.kind]}
              </span>
              {st.coming && <span className={styles.coming}>coming</span>}
            </span>
            <span className={styles.stepDetail}>{st.detail}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A stage button, with its own inline panel for narrow screens. */
function Node({ stage, open, onToggle }: { stage: Stage; open: boolean; onToggle: () => void }) {
  const ai = aiState(stage);
  return (
    <div className={styles.node}>
      <button
        type="button"
        className={styles.stage}
        aria-expanded={open}
        aria-controls={`process-detail process-detail-${stage.id}`}
        onClick={onToggle}
      >
        <span className={styles.num}>{stage.num}</span>
        <span className={styles.title}>{stage.title}</span>
        {ai === "live" && <span className={styles.ai}>AI</span>}
        {ai === "soon" && <span className={styles.aiSoon}>AI soon</span>}
      </button>
      {/* narrow screens: the steps open right under the stage that was tapped */}
      <div id={`process-detail-${stage.id}`} className={styles.inline} data-open={open ? "" : undefined}>
        <div className={styles.detailInner}>{open && <Panel key={stage.id} stage={stage} />}</div>
      </div>
    </div>
  );
}

export function ProcessMap() {
  const [open, setOpen] = useState<string | null>(null);
  const current = STAGES.find((s) => s.id === open) ?? null;
  const node = (s: Stage) => <Node stage={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />;

  return (
    <div className={styles.map}>
      <div className={styles.flow}>
        {node(SOURCING)}
        <Arrow />
        {node(NETWORKING)}
        <Arrow />
        {node(APPLYING)}
        <Arrow />
        {node(INTERVIEW)}
        <Arrow label="offer" />
        {node(OFFER)}

        {/* the loop: out of interview prep, round through Improve, back up into Sourcing */}
        <div className={styles.loop}>
          <span className={styles.loopHead} aria-hidden="true" />
          <span className={styles.loopBack}>go again, sharper</span>
          <span className={styles.loopOut}>not this time</span>
          <div className={styles.loopNode}>{node(IMPROVE)}</div>
        </div>
      </div>

      <div id="process-detail" className={styles.detail} data-open={current ? "" : undefined} aria-live="polite">
        <div className={styles.detailInner}>{current && <Panel key={current.id} stage={current} />}</div>
      </div>

      <p className={styles.legend}>
        <span className={styles.key}>
          <span className={styles.kind} data-kind="ai">AI</span> AI does the work
        </span>
        <span className={styles.key}>
          <span className={styles.kind} data-kind="auto">Automatic</span> the app&apos;s own rules, no AI
        </span>
        <span className={styles.key}>
          <span className={styles.kind} data-kind="you">You</span> your call
        </span>
        <span className={styles.key}>
          <span className={styles.coming}>coming</span> not built yet
        </span>
      </p>
    </div>
  );
}
