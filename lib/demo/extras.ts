import type { FakeDb } from "../repos/fake-db";
import type { ImportedWorkspace } from "../import/cvbuilder";
import type { Stage } from "../types";

/**
 * Everything the public demo shows that the CV corpus does not carry: applications spread
 * across the pipeline, a watchlist with sourced roles, written answers, practice attempts
 * and a contact. Dates are counted back from `today` so the Overview's streaks look alive.
 * All of it is fictional (docs/DESIGN.md "Demo").
 */

export function daysAgo(today: string, n: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Pipeline spread, newest application first: one of each stage worth showing. */
const SPREAD: { stage: Stage; savedDaysAgo: number; appliedDaysAgo: number | null; next: string | null }[] = [
  { stage: "interview", savedDaysAgo: 24, appliedDaysAgo: 20, next: "Practise the product-sense question before Thursday" },
  { stage: "screening", savedDaysAgo: 15, appliedDaysAgo: 12, next: "Reply to the recruiter with times" },
  { stage: "applied", savedDaysAgo: 6, appliedDaysAgo: 4, next: null },
  { stage: "saved", savedDaysAgo: 2, appliedDaysAgo: null, next: "Tailor the CV and apply" },
  { stage: "closed", savedDaysAgo: 40, appliedDaysAgo: 35, next: null },
];

/** Move the imported applications (all `saved`) along the pipeline, in a fixed order. */
export function stageDemoApplications(ws: ImportedWorkspace, today: string): ImportedWorkspace {
  const ordered = [...ws.applications].sort((a, b) => a.application.company.localeCompare(b.application.company));
  const applications = ordered.map((a, i) => {
    const s = SPREAD[i % SPREAD.length];
    return {
      ...a,
      application: {
        ...a.application,
        stage: s.stage,
        closedReason: s.stage === "closed" ? ("lost" as const) : null,
        savedAt: daysAgo(today, s.savedDaysAgo),
        appliedAt: s.appliedDaysAgo === null ? null : daysAgo(today, s.appliedDaysAgo),
        updatedAt: daysAgo(today, Math.max(0, (s.appliedDaysAgo ?? s.savedDaysAgo) - 2)),
        nextAction: s.next,
      },
    };
  });
  return { ...ws, applications };
}

const WATCH = [
  { company: "Kestrel AI", url: "https://example.com/careers/kestrel-ai", ats: "greenhouse" as const },
  { company: "Orchard Commerce", url: "https://example.com/careers/orchard", ats: "lever" as const },
  { company: "Atlas Mobility", url: "https://example.com/careers/atlas", ats: "ashby" as const },
  { company: "Harbour Studio", url: "https://example.com/careers/harbour-studio", ats: "unknown" as const },
];

const ROLES: { title: string; company: string; daysAgo: number; score: number | null; status: "new" | "shortlisted" | "dismissed" }[] = [
  { title: "Senior Product Manager, Payments", company: "Kestrel AI", daysAgo: 0, score: 86, status: "shortlisted" },
  { title: "Product Manager, Growth", company: "Orchard Commerce", daysAgo: 1, score: 78, status: "new" },
  { title: "Product Lead, Rider Experience", company: "Atlas Mobility", daysAgo: 3, score: 74, status: "new" },
  // Harbour Studio's board can't be read, so Apply shows the paste box (docs/APPLY-FLOW.md).
  { title: "Head of Product", company: "Harbour Studio", daysAgo: 2, score: 72, status: "new" },
  { title: "Product Operations Manager", company: "Kestrel AI", daysAgo: 5, score: 69, status: "new" },
  { title: "Strategy & Operations Lead", company: "Orchard Commerce", daysAgo: 8, score: null, status: "new" },
  { title: "Program Manager, Platform", company: "Atlas Mobility", daysAgo: 11, score: 61, status: "new" },
  { title: "Product Designer", company: "Orchard Commerce", daysAgo: 4, score: null, status: "dismissed" },
];

const ANSWERS = [
  {
    question_id: "influence-no-authority",
    situation: "At Quillpay, refunds took nine days because three teams each owned one step and nobody owned the whole.",
    task: "I had no authority over any of the three teams, but the delay was hurting our merchant retention.",
    action: "I mapped every hand-off with the people who did the work, showed each team lead where their step waited on another, and proposed one shared queue with a weekly fifteen-minute review that I ran.",
    result: "Refunds dropped to four days within two months, and the shared queue is still how the teams work.",
  },
  {
    question_id: "resilience-failure",
    situation: "I launched a loyalty feature at Northwind Retail that I was sure customers wanted.",
    task: "I owned the launch and the target of 15% repeat purchase uplift.",
    action: "When uplift came in at 2% I ran five customer calls in a week, learned the reward was too far away to matter, and cut the threshold in half.",
    result: "The second version reached 9% uplift. I now test the cheapest version before building the full one.",
  },
];

/** Seed the tables the corpus import leaves empty. */
export function seedDemoExtras(db: FakeDb, userId: string, today: string): void {
  const companyId = (name: string) => "sourcing-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  db.seed("sourcing_companies", WATCH.map((w) => ({
    id: companyId(w.company), user_id: userId, name: w.company, identity: w.company.toLowerCase(),
    website: "https://" + w.company.toLowerCase().replace(/\W+/g, "-") + ".example.com",
    active: true, research: [], research_version: 0, research_requested: false,
  })));
  db.seed(
    "watchlist",
    WATCH.map((w, i) => ({
      user_id: userId,
      company_id: companyId(w.company),
      company: w.company,
      careers_url: w.url,
      ats: w.ats,
      token: w.ats === "unknown" ? null : w.company.toLowerCase().replace(/\W+/g, "-"),
      active: true,
      added_at: daysAgo(today, 20 - i * 3),
      last_success_at: w.ats === "unknown" ? null : `${today}T00:00:00Z`,
    })),
  );
  db.seed(
    "sourced_jobs",
    ROLES.map((r, i) => ({
      user_id: userId,
      company_id: companyId(r.company),
      // The company's board type, so Save to pipeline treats it as readable (lib/demo/canned.ts cannedPosting).
      source: ((ats) => (!ats || ats === "unknown" ? "careers page" : ats))(WATCH.find((w) => w.company === r.company)?.ats),
      external_id: `demo-${i}`,
      title: r.title,
      company: r.company,
      location: "Singapore",
      // A made-up link on example.com, so the application page's "Open the posting" shows.
      url: `${WATCH.find((w) => w.company === r.company)?.url ?? "https://example.com/careers"}/jobs/demo-${i}`,
      posted_at: daysAgo(today, r.daysAgo),
      score: r.score,
      status: r.status,
      missed_refreshes: 0,
    })),
  );
  db.seed(
    "interview_answers",
    ANSWERS.map((a) => ({ user_id: userId, mode: "star" as const, body: "", ...a, updated_at: `${daysAgo(today, 3)}T10:00:00Z` })),
  );
  seedDemoRound(db, userId, today);
  db.seed("interview_attempts", [
    {
      user_id: userId,
      question_id: "influence-no-authority",
      transcript:
        "Interviewer: Tell me about a time you influenced people you had no authority over.\nYou: At Quillpay refunds took nine days because three teams each owned a step. I mapped the hand-offs with the people doing the work and proposed one shared queue with a weekly review. Refunds fell to four days in two months.",
      duration_seconds: 95,
      scores: { structure: 4, ownership: 4, specificity: 3, impact: 4, reflection: 2, relevance: 4 },
      overall: 3.5,
      strengths: ["Clear situation and a result with a number."],
      improvements: ["Say what you would do differently next time."],
      model: "demo",
      created_at: `${daysAgo(today, 1)}T09:00:00Z`,
    },
    {
      user_id: userId,
      question_id: "resilience-failure",
      transcript:
        "Interviewer: Tell me about a time you failed.\nYou: I launched a loyalty feature I was sure about and uplift came in at 2%. I called five customers, learned the reward was too far away, and halved the threshold.",
      duration_seconds: 70,
      scores: { structure: 3, ownership: 4, specificity: 3, impact: 3, reflection: 4, relevance: 4 },
      overall: 3.5,
      strengths: ["Honest about the miss, and the lesson is specific."],
      improvements: ["Give the second version's result too."],
      model: "demo",
      created_at: `${daysAgo(today, 4)}T18:30:00Z`,
    },
  ]);
  db.seed("contacts", [
    {
      id: "demo-contact-1",
      user_id: userId,
      name: "Priya Raman",
      network: { name: "Meridian Business School", class: "2024", campus: "Singapore" },
      company: "Kestrel AI",
      role: "Group Product Manager",
      location: "Singapore",
      warmth: "warm",
      status: "in-conversation",
      interests: ["payments", "hiring"],
      next_followup: daysAgo(today, -3),
      rolling_summary: "Alumna; offered to refer once the payments role opens.",
    },
    {
      id: "demo-contact-2",
      user_id: userId,
      name: "Daniel Sato",
      network: { name: "Former colleague at Quillpay", class: null, campus: null },
      company: "Orchard Commerce",
      role: "Head of Product, Checkout",
      location: "Singapore",
      warmth: "cold",
      status: "awaiting-reply",
      interests: ["checkout"],
      next_followup: daysAgo(today, 2),
      rolling_summary: "Worked together briefly at Quillpay; no reply yet.",
    },
    {
      id: "demo-contact-3",
      user_id: userId,
      name: "Lena Fischer",
      network: null,
      company: "Atlas Mobility",
      role: "Product Director",
      location: "Singapore",
      warmth: "cold",
      status: "not-contacted",
      interests: [],
      next_followup: null,
      rolling_summary: "",
    },
  ]);
  db.seed("interactions", [
    { user_id: userId, contact_id: "demo-contact-1", date: daysAgo(today, 9), channel: "linkedin", summary: "Asked for a short chat about the payments team.", raw_text: null },
    { user_id: userId, contact_id: "demo-contact-1", date: daysAgo(today, 2), channel: "coffee", summary: "Coffee: team is hiring in Q1; she will refer.", raw_text: null },
    { user_id: userId, contact_id: "demo-contact-2", date: daysAgo(today, 16), channel: "email", summary: "Asked how the checkout team thinks about payments risk.", raw_text: null },
  ]);
}

/**
 * A round an agent would have pushed for the fictional Kestrel AI application (role questions
 * over MCP, docs/FULL-INTERVIEW.md), so the demo shows a company page with a real round, a full
 * mock interview and role-plays. Made-up company, made-up facts from Maya's own corpus.
 */
const ROUND = [
  { ref: "kestrel:background", competency: "Motivation", short: "Your background", text: "Walk me through your background.", lookFor: "Ninety seconds, one arc from operations to product, one or two proof points, ending on why a developer platform now." },
  { ref: "kestrel:impact", competency: "Product judgement", short: "A product you shipped", text: "Tell me about a product decision you made that you are proud of.", lookFor: "The decision, the alternatives, what you personally did, and a measured result." },
  { ref: "kestrel:metric", competency: "Product judgement", short: "Picking the metric", text: "How did you decide what to measure for it, and what would you change?", lookFor: "A metric tied to the user's outcome, how it was measured, an honest view of its limits." },
  { ref: "kestrel:developers", competency: "Customer insight", short: "Developers as users", text: "Developers ignore most product announcements. How would you find out what they actually need from our platform?", lookFor: "Goes to where developers already are, watches real usage, small experiments before big builds." },
  { ref: "kestrel:questions", competency: "Motivation", short: "Your questions", text: "What questions do you have for me?", lookFor: "Two or three questions that show real interest in how the team works." },
];

const ROUND_MODEL_ANSWERS: Record<string, string> = {
  "kestrel:background":
    "I started in operations analytics at a regional logistics business, where I learned to sit with the people who use a tool before deciding what it should do. I moved into product in retail and payments. At Quillpay I owned refunds, and cut refund time from nine days to four in two months by giving three teams one shared queue. I am finishing my MBA and want to bring that habit to a platform developers rely on every day.",
  "kestrel:impact":
    "At Quillpay refunds took nine days because three teams each owned one step. I chose to fix the hand-offs rather than build a new tool. I mapped every hand-off with the people doing the work and ran a weekly fifteen-minute review of one shared queue. Refunds fell to four days within two months, and the queue is still how the teams work. Looking back I would have brought support in a month earlier.",
};

function seedDemoRound(db: FakeDb, userId: string, today: string): void {
  const app = db.rows("applications").find((a) => /kestrel/i.test(a.company));
  if (!app) return;
  const at = `${daysAgo(today, 2)}T09:00:00Z`;
  db.seed(
    "interview_role_questions",
    ROUND.map((q, i) => ({
      id: `demo-round-${i}`,
      user_id: userId,
      application_id: app.id,
      external_ref: q.ref,
      round: "Product interview with a Group PM, Thursday",
      interviewer: "a Group Product Manager at Kestrel AI, in a product interview for the developer platform team",
      position: i,
      competency: q.competency,
      text: q.text,
      short: q.short,
      look_for: q.lookFor,
      context: null,
      source: "Sample round for the demo",
      created_at: at,
      updated_at: at,
    })),
  );
  db.seed(
    "interview_model_answers",
    ROUND.flatMap((q, i) =>
      ROUND_MODEL_ANSWERS[q.ref]
        ? [{ user_id: userId, question_id: `role:demo-round-${i}`, text: ROUND_MODEL_ANSWERS[q.ref], source: "agent" as const, created_at: at, updated_at: at }]
        : [],
    ),
  );
}
