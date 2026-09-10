import { z } from "zod";

/**
 * A STAR interview story - CAPTURED from the user, never generated (DESIGN.md §3).
 * A model may reshape what the user said; it may not supply what they did not say.
 * `bulletId` is nullable: a story may back one CV bullet, or stand on its own.
 */
export const StorySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  bulletId: z.string().nullable(),
  situation: z.string(),
  task: z.string(),
  action: z.string(),
  result: z.string().min(1), // no Result, no STAR
  /** Competency labels, drawn from the user's vocabulary (see CompetencyVocab). */
  competencies: z.array(z.string()).default([]),
  /** Metric strings exactly as the user said them: "30%", "400+", "$2.1M". */
  numbers: z.array(z.string()).default([]),
  capturedAt: z.string(), // ISO date
});
export type Story = z.infer<typeof StorySchema>;

/** A behavioural competency label. The vocabulary is data (rule 4), so this is a plain string. */
export type Competency = string;

/**
 * competency -> trigger phrases found in JD text. One object is both the competency
 * LIST (its keys, in order) and the lexical TABLE that maps JD wording onto it.
 */
export type CompetencyVocab = Record<Competency, readonly string[]>;

/**
 * The shipped default TEMPLATE. Callers pass their own vocab to replace it entirely;
 * nothing downstream assumes these keys exist.
 */
export const DEFAULT_VOCAB: CompetencyVocab = {
  leadership: [
    "lead", "led", "leading", "leader", "leadership", "head of", "director", "vp",
    "mentor", "mentoring", "coach", "coaching", "team of", "people management",
    "senior", "staff", "principal",
  ],
  "influencing-without-authority": [
    "cross-functional", "cross functional", "influence", "influencing", "matrix", "matrixed",
    "without authority", "alignment", "align", "partner with", "partnering", "buy-in",
    "evangelise", "evangelize",
  ],
  conflict: [
    "conflict", "disagreement", "disagreements", "difficult conversations", "pushback",
    "push back", "negotiation", "negotiate", "negotiating", "escalation", "escalations",
  ],
  failure: [
    "failure", "failures", "failed", "post-mortem", "post-mortems", "postmortem", "postmortems",
    "lessons learned", "resilience", "setback", "setbacks", "retrospective", "retrospectives",
  ],
  ambiguity: [
    "ambiguous", "ambiguity", "0 to 1", "0-to-1", "zero to one", "0→1", "greenfield",
    "uncertain", "uncertainty", "undefined", "unstructured", "from scratch", "first principles",
    "startup", "start-up",
  ],
  prioritisation: [
    "prioritise", "prioritize", "prioritisation", "prioritization", "priorities", "roadmap",
    "backlog", "trade-off", "trade-offs", "tradeoff", "tradeoffs", "sequencing", "scope",
  ],
  "stakeholder-management": [
    "stakeholder", "stakeholders", "executive", "executives", "exec", "c-suite", "leadership team",
    "senior management", "board", "communicate", "communication", "presenting", "present to",
  ],
  "data-driven-decision": [
    "data-driven", "data driven", "metrics", "kpi", "kpis", "analytics", "a/b", "a/b testing",
    "experiment", "experiments", "experimentation", "sql", "insights", "quantitative", "measure",
    "measurement", "dashboards",
  ],
  "delivery-under-pressure": [
    "deadline", "deadlines", "fast-paced", "fast paced", "high-pressure", "under pressure",
    "ship", "shipped", "shipping", "deliver", "delivery", "execution", "launch", "launched",
    "tight timelines", "velocity",
  ],
  "customer-insight": [
    "customer", "customers", "user research", "users", "discovery", "customer interviews",
    "user interviews", "voice of customer", "empathy", "personas", "user-centric",
    "customer-centric", "customer feedback", "user feedback",
  ],
};

export const DEFAULT_COMPETENCIES: readonly Competency[] = Object.keys(DEFAULT_VOCAB);
