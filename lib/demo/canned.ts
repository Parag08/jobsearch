import { detectTags } from "../import/cvbuilder";
import { CASE_DIMENSIONS } from "../interview/case-session";
import { FOLLOW_UP_FALLBACK, PROBE_KINDS, type ProbeKind } from "../interview/mock";
import { SCORE_DIMENSIONS } from "../interview/score";
import type { JdExtract } from "../types";

/**
 * Pre-written answers for the public demo (docs/DESIGN.md "Demo"). A demo visitor never
 * reaches a model: every AI feature gets text from here instead, shaped exactly like the
 * model's reply so the same parsers and guards run on it. Nothing here costs a token.
 */
export const CANNED_TASKS = [
  "cover-letter",
  "model-answer",
  "probe",
  "case-turn",
  "case-debrief",
  "mock-turn",
  "mock-feedback",
  "role-plan",
] as const;
export type CannedTask = (typeof CANNED_TASKS)[number];

export interface CannedContext {
  /** case-turn: how many turns so far, to vary the line. */
  turn?: number;
  /** case-debrief: the case's question ids, one note each. */
  questionIds?: string[];
  /** mock-turn: the probes code chose, best first. */
  candidates?: string[];
  /** mock-feedback: probes asked, whether the question has a model answer, words said. */
  probes?: string[];
  hasModelAnswer?: boolean;
  words?: number;
  /** model-answer: the written draft (the rewrite only reflows it, so no number is added). */
  draft?: string;
}

const CASE_LINES = [
  "Good. Before you go further, which of those branches would you look at first, and why?",
  "That makes sense. What would you want to know about the client to test that?",
  "Okay. Talk me through how you would size that.",
  "Interesting. What is the so-what for the client here?",
  "Fair enough. Anything else you would add before we move on?",
];

const LETTER = [
  "I am writing to apply for this role on your team. Over the last eight years I have worked where product, operations and data meet: first running operations analytics for a regional logistics business, then as a product manager in retail and payments. The work I am proudest of is the unglamorous part, making a plan real once it leaves the slide, and I have learned to sit with the people who use a tool before deciding what it should do. In logistics that meant riding along on early shifts before redesigning a single report; in retail it meant reading every support ticket for a month before touching the loyalty programme. I am now finishing my MBA and want to bring that habit to a product people rely on every day.",
  "At my last company I owned the checkout and refunds roadmap. The roadmap itself was never the hard part. The hard part was the process that quietly assumed a team twice our size, and the release that was announced rather than adopted. I mapped every hand-off with the people who did the work, rebuilt how we sequenced it with engineering and operations, set up one weekly review of the numbers that mattered, and stopped shipping features nobody had asked the support team about. The result was fewer, better launches and a team that trusted the plan.",
  "That is also where I think I would be useful to you. I would bring a habit of plain writing, a bias for small experiments before big builds, and an honest view of what is and is not working. I write down what we believe, test the cheapest version first, and change course in public when the numbers say so. What draws me to your team is the detail you shared about how the work is done, not only what gets launched. I would like to do that work with a team that cares about getting the details right for its customers, and I would welcome a conversation about where I could help first.",
].join("\n\n");

const PLAN = [
  "Week 1: Pick the two gaps that appear in most of the roles you saved. For each, write one sentence on where you have already done something close to it.",
  "Week 2: Close the first gap with a small, real piece of work - a short analysis, a teardown or a one-page proposal you could show in an interview.",
  "Week 3: Do the same for the second gap, and add the result to your experience bank as a draft point.",
  "Week 4: Rehearse both stories out loud in the Interview tab until you can tell each in under two minutes, with the number first.",
].join("\n");

const PROBES = [
  "What did you personally do, as opposed to the team?",
  "Who disagreed with the approach, and how did you bring them round?",
  "How was that result measured, and over what period?",
  "If you did it again tomorrow, what would you change first?",
].join("\n");

/** Reflow a STAR draft into plain paragraphs. Only the draft's own words, so guardRewrite passes. */
function reflow(draft: string): string {
  const parts = draft
    .split("\n")
    .map((l) => l.replace(/^\s*(situation|task|action|result|answer)\s*:\s*/i, "").trim())
    .filter(Boolean);
  return parts.join("\n");
}

const score = (base: number, bump: number) => Math.max(1, Math.min(5, base + bump));

export function cannedText(task: CannedTask, ctx: CannedContext): string {
  switch (task) {
    case "cover-letter":
      return LETTER;
    case "role-plan":
      return PLAN;
    case "probe":
      return PROBES;
    case "model-answer":
      return reflow(ctx.draft ?? "");
    case "case-turn":
      return JSON.stringify({ say: CASE_LINES[(ctx.turn ?? 0) % CASE_LINES.length], done: false });
    case "case-debrief":
      return JSON.stringify({
        scores: Object.fromEntries(CASE_DIMENSIONS.map((d, i) => [d, i % 3 === 0 ? 4 : 3])),
        strengths: ["You laid out a clear structure before diving in.", "You asked for data instead of guessing."],
        improvements: ["State your answer first, then the reasons.", "Sense-check each number out loud before moving on."],
        perQuestion: (ctx.questionIds ?? []).map((questionId) => ({ questionId, note: "Solid start; push for the so-what sooner." })),
      });
    case "mock-turn": {
      const probe = (ctx.candidates?.[0] ?? "result") as ProbeKind;
      return JSON.stringify({ probe, say: FOLLOW_UP_FALLBACK[probe] ?? FOLLOW_UP_FALLBACK.result });
    }
    case "mock-feedback": {
      const long = (ctx.words ?? 0) >= 150 ? 1 : 0;
      const probes = (ctx.probes ?? []).filter((p): p is ProbeKind => (PROBE_KINDS as readonly string[]).includes(p));
      return JSON.stringify({
        scores: Object.fromEntries(SCORE_DIMENSIONS.map((d, i) => [d, score(3, i % 2 === 0 ? long : 0)])),
        strengths: ["You opened with the situation quickly.", "The action was clearly yours."],
        improvements: ["Lead with the result, then explain how you got there.", "Put a number on the outcome."],
        followUps: probes.map((probe) => ({ probe, verdict: "partial", note: "A fair answer; one concrete example would make it land." })),
        comparison: ctx.hasModelAnswer
          ? {
              covered: ["The problem you were asked to fix"],
              missed: ["The result, stated as a number"],
              different: [],
            }
          : undefined,
      });
    }
  }
}

const CITIES = ["Singapore", "London", "Dubai", "Hong Kong", "Sydney", "New York", "Remote"];
const SENIORITY = ["intern", "graduate", "associate", "senior", "staff", "principal", "lead", "head", "director", "vp"];

/** A JD read by rules only (company, role, skills, city), standing in for the extract call in the demo. */
export function lexicalExtract(jd: string, taxonomy: unknown): JdExtract {
  const lines = jd.split("\n").map((l) => l.trim()).filter(Boolean);
  const role = (lines[0] ?? "Role").slice(0, 120);
  const named = jd.match(/^\s*company\s*:\s*(.+)$/im)?.[1] ?? jd.match(/\babout\s+([A-Z][\w&.]*(?:\s+[A-Z][\w&.]*){0,3})/)?.[1];
  const company = named?.trim() || "Sample company";
  const hits = detectTags(jd, taxonomy);
  const location = CITIES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(jd)) ?? null;
  return {
    company,
    role,
    roleFamily: "general",
    sectorPath: [location ?? "Sample sector"],
    skills: hits.tags,
    keywords: [...new Set(hits.phrases)],
    seniority: SENIORITY.find((s) => new RegExp(`\\b${s}\\b`, "i").test(role)) ?? null,
    visaNote: null,
    location,
  };
}

/**
 * A posting for a demo watchlist role. The sample boards are made up, so there is nothing to
 * fetch; this reads like a real posting and names the role, company and city so the rules-only
 * reader (lexicalExtract) finds them.
 */
export function cannedPosting(title: string, company: string, location: string | null): string {
  const city = location ?? "Singapore";
  return [
    title,
    `Company: ${company}`,
    "",
    `${company} is hiring a ${title} in ${city}. You will own a product area end to end: set the roadmap, run discovery with customers, and work cross-functional with engineering, design and operations to ship it.`,
    "",
    "What you will do",
    "- Turn customer research and data analysis into a clear, prioritised roadmap",
    "- Define the metrics and KPIs for your area and report on them every week",
    "- Lead launches with go-to-market, support and operations teams",
    "- Run experiments and decide what to scale from the results",
    "",
    "What you bring",
    "- Product management experience in a fast-moving team",
    "- Strong SQL and data analysis; comfortable building your own dashboards",
    "- Stakeholder management across senior leaders and partners",
    "- Experience mentoring others is a plus",
  ].join("\n");
}
