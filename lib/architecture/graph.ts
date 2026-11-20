/**
 * The system architecture as data: what exists today, what is planned, and how requests
 * move through it. One source for the 3D diagram on /architecture and for the tables in
 * docs/ARCHITECTURE.md - when a planned node ships, flip its `era` to "today" here and
 * strike its item in docs/ROADMAP.md (`roadmap` holds that item's id).
 *
 * Pure data and pure functions: no I/O, no Three.js. The scene reads positions from
 * `layoutGraph` and never invents a node of its own.
 */

export type Era = "today" | "future";
/** live = a user can reach it. partial = tested code no page or job calls yet. planned = not built. */
export type Status = "live" | "partial" | "planned";
export type EdgeKind = "request" | "call" | "data" | "model" | "schedule" | "agent";
export type LayerId = "clients" | "app" | "services" | "domain" | "ports" | "infra" | "ops";

export interface Layer {
  id: LayerId;
  label: string;
  note: string;
}

export interface ArchNode {
  id: string;
  label: string;
  layer: LayerId;
  era: Era;
  status: Status;
  /** One or two sentences: what it does and the rule it keeps. */
  what: string;
  /** Files, routes or services - where to look. */
  where: string;
  /** docs/ROADMAP.md item that builds or finishes it. Required for future nodes. */
  roadmap?: string;
}

export interface ArchEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  era: Era;
  /** A today edge the future architecture replaces (hidden in the future view). */
  retires?: boolean;
  note?: string;
}

export interface FlowStep {
  from: string;
  to: string;
  /** What happens on this step, in plain words. */
  say: string;
}

export interface Flow {
  id: string;
  label: string;
  era: Era;
  summary: string;
  /** Edges walked in order. Each must exist in the flow's era. */
  steps: FlowStep[];
}

export const LAYERS: Layer[] = [
  { id: "clients", label: "Clients", note: "Who calls the system" },
  { id: "app", label: "Next.js on Vercel (sin1)", note: "Routing, pages, server actions, API" },
  { id: "services", label: "Services", note: "lib/services - one use case each, the only place I/O is composed" },
  { id: "domain", label: "Domain", note: "Pure lib/ - rules, no I/O, unit-tested" },
  { id: "ports", label: "Ports and adapters", note: "The only code that knows a vendor" },
  { id: "infra", label: "Data and providers", note: "Supabase, model providers, third parties" },
  { id: "ops", label: "Automation and sources", note: "CI, schedules, the CV corpus" },
];

// Order matters: on each layer today's nodes come first, so nothing moves when the future arrives.
export const NODES: ArchNode[] = [
  // ---- clients ---------------------------------------------------------------------------
  {
    id: "browser",
    label: "Browser",
    layer: "clients",
    era: "today",
    status: "live",
    what: "The landing page and the signed-in app. Speech recognition and the fallback voice run here, in the browser.",
    where: "app/page.tsx, app/app/**",
  },
  {
    id: "agent",
    label: "AI agent (MCP client)",
    layer: "clients",
    era: "today",
    status: "live",
    what: "An agent holding a personal token. Today that is the findparagjob workspace, which pushes roles and the outreach log and reads the pipeline back.",
    where: "findparagjob tools/portal-sync; token made on /app/agent",
  },
  {
    id: "peers",
    label: "Peer workspaces",
    layer: "clients",
    era: "future",
    status: "planned",
    what: "Other job seekers with their own workspace: invited, with their own settings and token budget. The schema is ready (user_id + RLS everywhere); the product is not.",
    where: "SPEC section 7",
    roadmap: "U1",
  },
  {
    id: "capture",
    label: "Role capture",
    layer: "clients",
    era: "future",
    status: "planned",
    what: "A bookmarklet or extension that sends the posting you are looking at into the pipeline, so pasting is no longer the only way in.",
    where: "new; posts to /api/jd with a personal token",
    roadmap: "S6",
  },

  // ---- app -------------------------------------------------------------------------------
  {
    id: "middleware",
    label: "Middleware",
    layer: "app",
    era: "today",
    status: "live",
    what: "Refreshes the Supabase session on every request and sends signed-in visitors from / and /signin to /app.",
    where: "middleware.ts, lib/auth/routing.ts",
  },
  {
    id: "pages",
    label: "Pages + server actions",
    layer: "app",
    era: "today",
    status: "live",
    what: "Server components and server actions for pipeline, application detail, bank, watchlist, interview, insights and agent tokens. They call getWorkspace() and services, nothing else.",
    where: "app/app/**, app/app/actions.ts",
  },
  {
    id: "api",
    label: "API routes",
    layer: "app",
    era: "today",
    status: "live",
    what: "JSON and file endpoints for the signed-in user: read a posting, diff a CV, export DOCX or PDF, the brief, interviewer speech.",
    where: "app/api/{jd,cv-diff,brief,export,tts}",
  },
  {
    id: "mcp",
    label: "MCP server",
    layer: "app",
    era: "today",
    status: "live",
    what: "Stateless MCP over JSON-RPC, hand-rolled. Ten tools. Authenticated by a hashed personal token; runs with the secret key, so every tool filters on the token's user id.",
    where: "app/api/mcp, lib/mcp/{server,tools}.ts",
  },
  {
    id: "cron",
    label: "Cron routes",
    layer: "app",
    era: "future",
    status: "planned",
    what: "Scheduled entry points inside the app, so sourcing, role reading and the brief run next to the database with the app's own code and secrets instead of from GitHub Actions.",
    where: "new: app/api/cron/*, vercel.json crons",
    roadmap: "P1",
  },
  {
    id: "guard",
    label: "Limits + budgets",
    layer: "app",
    era: "future",
    status: "planned",
    what: "Per-user rate limits on the routes that spend tokens and on MCP, and a monthly token budget read from the ledger. Needed before peers.",
    where: "new: lib/limits; reads token_ledger",
    roadmap: "P4",
  },

  // ---- services --------------------------------------------------------------------------
  {
    id: "intake",
    label: "Role intake",
    layer: "services",
    era: "today",
    status: "live",
    what: "The one place a posting becomes structure. Reads it once into a JdExtract; everything downstream reads the extract, never the raw text.",
    where: "lib/services/{read-role,process-jd}.ts",
  },
  {
    id: "tailor",
    label: "CV tailoring",
    layer: "services",
    era: "today",
    status: "live",
    what: "Picks bullets for a role from the whole bank under caps and balance rules, fits the page, and stores the result as a diff from the master.",
    where: "lib/services/tailor-cv.ts",
  },
  {
    id: "letter",
    label: "Cover letter",
    layer: "services",
    era: "today",
    status: "live",
    what: "Drafts the letter around the gaps the CV cannot honestly claim. One premium call, then voice and number checks in code.",
    where: "lib/services/cover-letter.ts, lib/cover-letter",
  },
  {
    id: "export",
    label: "Export",
    layer: "services",
    era: "today",
    status: "live",
    what: "Resolves the CV once and renders DOCX and PDF from the same structure. Frozen text once the application is sent.",
    where: "lib/services/export-cv.ts, lib/export/*",
  },
  {
    id: "sourcing",
    label: "Sourcing refresh",
    layer: "services",
    era: "today",
    status: "live",
    what: "Pulls open roles from each watched company's own board, filters to the profile's cities and titles, scores them, and retires postings that close.",
    where: "lib/services/refresh-watchlist.ts",
  },
  {
    id: "interviewSvc",
    label: "Interview room",
    layer: "services",
    era: "today",
    status: "live",
    what: "Behavioural mock with pushback and a debrief, live case interviewer, and delivery scoring. A small model per turn, premium for the debrief.",
    where: "app/app/interview/*, lib/interview/{mock,score,case-session}.ts",
  },
  {
    id: "insights",
    label: "Role insights + plan",
    layer: "services",
    era: "today",
    status: "live",
    what: "Adds up what every stored role asks for, marks each requirement evidenced, unstated or a gap, and drafts a plan to close the top gaps.",
    where: "lib/insights/*, lib/services/role-plan.ts",
  },
  {
    id: "agentSync",
    label: "Agent sync",
    layer: "services",
    era: "today",
    status: "live",
    what: "The rules agents must follow: upserts are idempotent on external_ref and never move a stage; a stage change needs a date and evidence.",
    where: "lib/services/agent-sync.ts",
  },
  {
    id: "brief",
    label: "Morning brief",
    layer: "services",
    era: "today",
    status: "partial",
    what: "New roles, follow-ups due and stale applications in one read. Built and tested, reachable only as an API: no page and no schedule yet.",
    where: "lib/services/daily-brief.ts, /api/brief",
    roadmap: "X1",
  },
  {
    id: "outreach",
    label: "Outreach CRM",
    layer: "services",
    era: "today",
    status: "partial",
    what: "Contacts added by name or pasted LinkedIn link, and a conversation log that sets the next follow-up from warmth, on the Network tab. The first-message draft grounded in your record is still to come.",
    where: "lib/networking/contacts.ts, lib/services/network.ts, lib/outreach.ts, /app/network",
    roadmap: "N2",
  },
  {
    id: "improve",
    label: "Improve loop",
    layer: "services",
    era: "future",
    status: "planned",
    what: "Records how each application ended, finds where they stall, and turns the pattern into changes to the CV, stories or practice.",
    where: "new: lib/improve; reads applications, interview_attempts, case_sessions",
    roadmap: "V1",
  },
  {
    id: "offer",
    label: "Offer + negotiation",
    layer: "services",
    era: "future",
    status: "planned",
    what: "The target package, an offer set against it, and a rehearsal of the call with an AI counterpart on the interview turn loop.",
    where: "new; reuses lib/interview case-room loop",
    roadmap: "O1",
  },

  // ---- domain ----------------------------------------------------------------------------
  {
    id: "editorial",
    label: "Editorial rules",
    layer: "domain",
    era: "today",
    status: "live",
    what: "Scores bullets through the user's taxonomy, selects under per-role and per-org caps, one story per competency, short variant before a cut, page fit, and the gap list.",
    where: "lib/editorial/*",
  },
  {
    id: "matcher",
    label: "Matcher + CV diff",
    layer: "domain",
    era: "today",
    status: "live",
    what: "The honesty rule lives here: a CV never mirrors a keyword unless a bullet in the bank evidences it. Tailoring is a diff, not a rewrite.",
    where: "lib/bullet-matcher.ts, lib/cv-diff.ts, lib/freeze.ts",
  },
  {
    id: "pipeline",
    label: "Pipeline",
    layer: "domain",
    era: "today",
    status: "live",
    what: "Stages, the moves allowed between them, stale and follow-up flags, and which cards the board shows.",
    where: "lib/pipeline.ts",
  },
  {
    id: "fit",
    label: "Fit + watchlist rules",
    layer: "domain",
    era: "today",
    status: "live",
    what: "Fit score from sector, skills, network and location; title and city targets; posting identity across refreshes; when a role counts as closed.",
    where: "lib/scoring.ts, lib/watchlist/*",
  },
  {
    id: "interviewDomain",
    label: "Interview engine",
    layer: "domain",
    era: "today",
    status: "live",
    what: "Code owns the case path and checks the maths; the model only talks, and guardReply stops it stating figures the case does not contain.",
    where: "lib/interview/*",
  },
  {
    id: "stories",
    label: "Stories + prep",
    layer: "domain",
    era: "today",
    status: "live",
    what: "Which story answers which competency for this exact application, and where spoken numbers disagree with the CV.",
    where: "lib/stories/*",
  },
  {
    id: "sector",
    label: "Sector graph",
    layer: "domain",
    era: "today",
    status: "live",
    what: "A tree of sectors that learns skill frequencies from every posting read. It works; no page shows it yet.",
    where: "lib/sector-graph.ts",
  },
  {
    id: "semantic",
    label: "Semantic match",
    layer: "domain",
    era: "future",
    status: "planned",
    what: "Shortlists bullets and roles by meaning as well as by tag and word, so a posting that says it differently still finds the evidence. Rules stay first; this widens the shortlist.",
    where: "new: lib/semantic; behind the editorial scorer",
    roadmap: "P6",
  },

  // ---- ports and adapters ----------------------------------------------------------------
  {
    id: "db",
    label: "Workspace + repos",
    layer: "ports",
    era: "today",
    status: "live",
    what: "getWorkspace() returns {db, userId, mode}: live through session cookies with RLS, or an in-memory demo when Supabase is not configured. The only code that knows the database.",
    where: "lib/db/*, lib/repos/*",
  },
  {
    id: "llm",
    label: "LLM router",
    layer: "ports",
    era: "today",
    status: "live",
    what: "Routes each task to a small or premium model, falls back across providers, and logs every call to the token ledger.",
    where: "lib/adapters/{llm,llm-factory}.ts",
  },
  {
    id: "files",
    label: "File store",
    layer: "ports",
    era: "today",
    status: "live",
    what: "A FileStore interface for exported documents, with a per-user folder in a private bucket behind it.",
    where: "lib/export/file-store.ts, lib/db",
  },
  {
    id: "ats",
    label: "Board fetcher",
    layer: "ports",
    era: "today",
    status: "live",
    what: "Fixed public endpoints for Greenhouse, Lever, Ashby and SmartRecruiters, built from a board token. No scraping.",
    where: "lib/watchlist/{ats,fetcher,mappers}.ts",
  },
  {
    id: "tts",
    label: "Voice adapter",
    layer: "ports",
    era: "today",
    status: "live",
    what: "Optional ElevenLabs voice for the interviewer, capped per request; the browser voice is the fallback.",
    where: "lib/adapters/elevenlabs.ts, /api/tts",
  },
  {
    id: "queue",
    label: "Job queue",
    layer: "ports",
    era: "future",
    status: "planned",
    what: "A jobs table with retries, so slow work (reading fifty pushed roles, a full refresh) runs in the background in small batches instead of inside a button press.",
    where: "new: jobs table + lib/jobs; drained by cron routes",
    roadmap: "P2",
  },
  {
    id: "obs",
    label: "Traces + error log",
    layer: "ports",
    era: "future",
    status: "planned",
    what: "Errors and slow calls kept longer than Vercel's one hour, and a token budget view over the ledger.",
    where: "new: app_events table or a log drain; /app/usage",
    roadmap: "P3",
  },

  // ---- data and providers ----------------------------------------------------------------
  {
    id: "pg",
    label: "Supabase Postgres",
    layer: "infra",
    era: "today",
    status: "live",
    what: "Twenty tables, every one with user_id and row-level security. Changes only through numbered migrations. Singapore region, free tier.",
    where: "supabase/schema.sql, supabase/migrations/*",
  },
  {
    id: "auth",
    label: "Supabase Auth",
    layer: "infra",
    era: "today",
    status: "live",
    what: "Google and LinkedIn sign-in, Google One Tap. A new account gets a profile through a trigger.",
    where: "app/signin, app/auth/callback, lib/auth",
  },
  {
    id: "storage",
    label: "Supabase Storage",
    layer: "infra",
    era: "today",
    status: "live",
    what: "Private bucket of exported CVs and letters, one folder per user.",
    where: "bucket cv-exports (migration 0006)",
  },
  {
    id: "models",
    label: "Model providers",
    layer: "infra",
    era: "today",
    status: "live",
    what: "Gemini and Groq free tiers for reading and classifying; Anthropic or the Vercel AI Gateway for the writing a user sees.",
    where: "lib/adapters/{gemini,groq,anthropic,vercel-gateway}.ts",
  },
  {
    id: "eleven",
    label: "ElevenLabs",
    layer: "infra",
    era: "today",
    status: "live",
    what: "Text to speech for the interviewer. Optional; transcripts only, audio is never stored.",
    where: "ELEVENLABS_* env",
  },
  {
    id: "boards",
    label: "Company job boards",
    layer: "infra",
    era: "today",
    status: "live",
    what: "Each watched company's own applicant-tracking board: the source of truth for what is open.",
    where: "Greenhouse, Lever, Ashby, SmartRecruiters",
  },
  {
    id: "vector",
    label: "pgvector",
    layer: "infra",
    era: "future",
    status: "planned",
    what: "Embeddings for bullets and role extracts, stored beside the rows they describe.",
    where: "new migration; Supabase extension",
    roadmap: "P6",
  },
  {
    id: "backup",
    label: "Nightly backup",
    layer: "infra",
    era: "future",
    status: "planned",
    what: "A scheduled dump of the hand-typed tables (answers, attempts, case sessions, contacts). The free tier keeps no backups and this data cannot be regenerated.",
    where: "new: workflow or cron route -> private bucket",
    roadmap: "P5",
  },
  {
    id: "aggregators",
    label: "Aggregator feeds",
    layer: "infra",
    era: "future",
    status: "planned",
    what: "Adzuna and Jooble for firms not on the watchlist. The Adzuna adapter is built and tested, not wired.",
    where: "lib/adapters/adzuna.ts (built)",
    roadmap: "S5",
  },

  // ---- automation and sources ------------------------------------------------------------
  {
    id: "gha",
    label: "GitHub Actions",
    layer: "ops",
    era: "today",
    status: "live",
    what: "Tests, typecheck and build on every push; pending migrations applied on push; a daily sourcing run; a twice-weekly keepalive so the free database does not pause.",
    where: ".github/workflows/{ci,db,sourcing,keepalive}.yml",
  },
  {
    id: "corpus",
    label: "findparagjob corpus",
    layer: "ops",
    era: "today",
    status: "live",
    what: "The source of truth for the CV corpus: profile, bullets, taxonomy, archetypes. Synced one way into data/cvbuilder, which generates the seed.",
    where: "npm run data:sync -> seed:build -> db:seed",
  },
  {
    id: "evals",
    label: "Eval harness",
    layer: "ops",
    era: "future",
    status: "planned",
    what: "Golden cases run before a prompt or selection rule changes: hand-made CVs as the benchmark for tailoring, fixed postings for extraction, fixed transcripts for scoring.",
    where: "new: evals/ + npm run eval; starts from the AWS TAM benchmark",
    roadmap: "Q3",
  },
];

export const EDGES: ArchEdge[] = [
  // clients -> app
  { from: "browser", to: "middleware", kind: "request", era: "today", note: "every page request" },
  { from: "browser", to: "api", kind: "request", era: "today" },
  { from: "agent", to: "mcp", kind: "agent", era: "today", note: "Bearer token, JSON-RPC" },
  { from: "middleware", to: "pages", kind: "request", era: "today" },
  { from: "middleware", to: "auth", kind: "data", era: "today", note: "session refresh" },

  // app -> services
  { from: "pages", to: "intake", kind: "call", era: "today" },
  { from: "pages", to: "tailor", kind: "call", era: "today" },
  { from: "pages", to: "letter", kind: "call", era: "today" },
  { from: "pages", to: "sourcing", kind: "call", era: "today", note: "Refresh button" },
  { from: "pages", to: "interviewSvc", kind: "call", era: "today" },
  { from: "pages", to: "insights", kind: "call", era: "today" },
  { from: "pages", to: "pipeline", kind: "call", era: "today", note: "stage moves, board" },
  { from: "pages", to: "stories", kind: "call", era: "today", note: "prep for this application" },
  { from: "api", to: "intake", kind: "call", era: "today" },
  { from: "api", to: "export", kind: "call", era: "today" },
  { from: "api", to: "brief", kind: "call", era: "today" },
  { from: "api", to: "tts", kind: "call", era: "today" },
  { from: "mcp", to: "agentSync", kind: "call", era: "today" },
  { from: "mcp", to: "insights", kind: "call", era: "today", note: "role_insights tool" },

  // services -> domain
  { from: "intake", to: "sector", kind: "call", era: "today" },
  { from: "tailor", to: "editorial", kind: "call", era: "today" },
  { from: "tailor", to: "matcher", kind: "call", era: "today" },
  { from: "letter", to: "editorial", kind: "call", era: "today", note: "the honest gaps" },
  { from: "export", to: "matcher", kind: "call", era: "today", note: "resolve the diff" },
  { from: "sourcing", to: "fit", kind: "call", era: "today" },
  { from: "interviewSvc", to: "interviewDomain", kind: "call", era: "today" },
  { from: "agentSync", to: "pipeline", kind: "call", era: "today" },
  { from: "agentSync", to: "intake", kind: "call", era: "today", note: "pushed roles are read too" },
  { from: "brief", to: "pipeline", kind: "call", era: "today" },
  { from: "insights", to: "editorial", kind: "call", era: "today", note: "evidenced / unstated / gap" },

  // services -> ports
  { from: "intake", to: "llm", kind: "model", era: "today", note: "small tier" },
  { from: "letter", to: "llm", kind: "model", era: "today", note: "premium tier" },
  { from: "interviewSvc", to: "llm", kind: "model", era: "today" },
  { from: "insights", to: "llm", kind: "model", era: "today", note: "one premium call per plan" },
  { from: "intake", to: "db", kind: "data", era: "today" },
  { from: "tailor", to: "db", kind: "data", era: "today" },
  { from: "letter", to: "db", kind: "data", era: "today" },
  { from: "sourcing", to: "db", kind: "data", era: "today" },
  { from: "interviewSvc", to: "db", kind: "data", era: "today" },
  { from: "insights", to: "db", kind: "data", era: "today" },
  { from: "agentSync", to: "db", kind: "data", era: "today", note: "secret key; filters on user id" },
  { from: "brief", to: "db", kind: "data", era: "today" },
  { from: "export", to: "files", kind: "data", era: "today" },
  { from: "sourcing", to: "ats", kind: "call", era: "today" },

  // ports -> infra
  { from: "db", to: "pg", kind: "data", era: "today", note: "RLS: user_id = auth.uid()" },
  { from: "db", to: "auth", kind: "data", era: "today" },
  { from: "llm", to: "models", kind: "model", era: "today" },
  { from: "llm", to: "pg", kind: "data", era: "today", note: "token_ledger" },
  { from: "files", to: "storage", kind: "data", era: "today" },
  { from: "ats", to: "boards", kind: "request", era: "today" },
  { from: "tts", to: "eleven", kind: "model", era: "today" },

  // automation
  { from: "gha", to: "sourcing", kind: "schedule", era: "today", retires: true, note: "daily 07:07 SGT" },
  { from: "gha", to: "pg", kind: "schedule", era: "today", note: "migrations, keepalive" },
  { from: "corpus", to: "pg", kind: "data", era: "today", note: "generated seed" },
  { from: "corpus", to: "agent", kind: "agent", era: "today", note: "the workspace the agent runs in" },

  // ---- future ----------------------------------------------------------------------------
  { from: "peers", to: "middleware", kind: "request", era: "future" },
  { from: "capture", to: "api", kind: "request", era: "future" },
  { from: "api", to: "guard", kind: "call", era: "future" },
  { from: "mcp", to: "guard", kind: "call", era: "future" },
  { from: "guard", to: "db", kind: "data", era: "future", note: "reads the ledger" },
  { from: "cron", to: "sourcing", kind: "schedule", era: "future" },
  { from: "cron", to: "brief", kind: "schedule", era: "future" },
  { from: "cron", to: "queue", kind: "schedule", era: "future", note: "drain a batch" },
  { from: "sourcing", to: "queue", kind: "call", era: "future", note: "enqueue new roles to read" },
  { from: "agentSync", to: "queue", kind: "call", era: "future" },
  { from: "queue", to: "intake", kind: "call", era: "future" },
  { from: "queue", to: "pg", kind: "data", era: "future", note: "jobs table" },
  { from: "pages", to: "brief", kind: "call", era: "future", note: "the brief on /app" },
  { from: "pages", to: "outreach", kind: "call", era: "today", note: "the Network tab" },
  { from: "pages", to: "improve", kind: "call", era: "future" },
  { from: "pages", to: "offer", kind: "call", era: "future" },
  { from: "mcp", to: "outreach", kind: "call", era: "today" },
  { from: "mcp", to: "tailor", kind: "call", era: "future", note: "tailor and export as tools" },
  { from: "outreach", to: "llm", kind: "model", era: "future" },
  { from: "outreach", to: "db", kind: "data", era: "today" },
  { from: "improve", to: "llm", kind: "model", era: "future" },
  { from: "improve", to: "db", kind: "data", era: "future" },
  { from: "improve", to: "pipeline", kind: "call", era: "future" },
  { from: "offer", to: "interviewDomain", kind: "call", era: "future" },
  { from: "offer", to: "db", kind: "data", era: "future" },
  { from: "editorial", to: "semantic", kind: "call", era: "future" },
  { from: "fit", to: "semantic", kind: "call", era: "future" },
  { from: "semantic", to: "vector", kind: "data", era: "future" },
  { from: "llm", to: "obs", kind: "data", era: "future" },
  { from: "obs", to: "pg", kind: "data", era: "future" },
  { from: "pg", to: "backup", kind: "schedule", era: "future" },
  { from: "ats", to: "aggregators", kind: "request", era: "future" },
  { from: "gha", to: "evals", kind: "schedule", era: "future", note: "on prompt or rule changes" },
  { from: "evals", to: "llm", kind: "model", era: "future" },
];

const step = (from: string, to: string, say: string): FlowStep => ({ from, to, say });

// Each flow is small on purpose: one job, a handful of parts, read top to bottom.
export const FLOWS: Flow[] = [
  {
    id: "read-posting",
    label: "Read a posting",
    era: "today",
    summary: "You paste a job posting. A model reads it once and the app stores what it asks for, so nothing ever has to read the raw text again.",
    steps: [
      step("browser", "middleware", "You paste the posting and press save. The request arrives and your session is refreshed."),
      step("middleware", "pages", "The page's server action receives the text."),
      step("pages", "intake", "It hands the text to role intake - the only place a posting is turned into structure."),
      step("intake", "llm", "Role intake asks for a small, cheap model."),
      step("llm", "models", "The model returns company, role, seniority and the skills asked for. The call is logged."),
      step("intake", "db", "The structured result is saved with the application."),
      step("db", "pg", "It lands in Postgres, visible only to you."),
    ],
  },
  {
    id: "tailor-cv",
    label: "Tailor the CV",
    era: "today",
    summary: "The app chooses which of your bullets go on the page for this role. This is rules, not a model: it costs nothing and cannot invent experience.",
    steps: [
      step("browser", "middleware", "You open the application and ask for a tailored CV."),
      step("middleware", "pages", "The page calls the tailoring service."),
      step("pages", "tailor", "Tailoring loads your bullet bank and what the role asks for."),
      step("tailor", "editorial", "Each bullet is scored against the role, then chosen under caps: no employer dominates, one story per skill, and the page must fit."),
      step("tailor", "matcher", "The honesty check: a keyword appears only if one of your bullets evidences it."),
      step("tailor", "db", "The result is stored as a list of changes from your master CV."),
      step("db", "pg", "Saved in Postgres."),
    ],
  },
  {
    id: "export-cv",
    label: "Export and send",
    era: "today",
    summary: "The tailored CV becomes a PDF or Word file. Once you mark the application as sent, that exact text is frozen.",
    steps: [
      step("browser", "api", "You press download."),
      step("api", "export", "The export service is called for this application."),
      step("export", "matcher", "The stored changes are applied to the master to produce the final text."),
      step("export", "files", "One resolved CV is rendered as both PDF and DOCX."),
      step("files", "storage", "A copy is kept in your private folder."),
    ],
  },
  {
    id: "agent-push",
    label: "An agent adds a role",
    era: "today",
    summary: "An AI agent you trust adds roles for you. It gets a small set of tools with rules, never the database itself.",
    steps: [
      step("agent", "mcp", "The agent calls a tool with your personal token."),
      step("mcp", "agentSync", "The token is matched to you, and the request goes to the sync rules."),
      step("agentSync", "pipeline", "Rules apply: the same role twice is one role, and an agent cannot move a stage without a date and evidence."),
      step("agentSync", "intake", "The posting is read exactly like one you pasted."),
      step("intake", "llm", "A small model reads it once."),
      step("llm", "models", "The structured result comes back and the call is logged."),
      step("agentSync", "db", "The role is saved to your pipeline."),
      step("db", "pg", "Stored in Postgres."),
    ],
  },
  {
    id: "daily-sourcing",
    label: "Daily sourcing",
    era: "today",
    summary: "Every morning the app checks the companies you watch for new roles. No model is involved.",
    steps: [
      step("gha", "sourcing", "A scheduled job starts the refresh at 07:07 Singapore time."),
      step("sourcing", "ats", "For each watched company, the fetcher builds the address of its job board."),
      step("ats", "boards", "It reads the company's own board - never an aggregator, never a scrape."),
      step("sourcing", "fit", "Roles are filtered to your cities and titles, scored for fit, and closed ones are retired."),
      step("sourcing", "db", "New and updated roles are written to your watchlist."),
      step("db", "pg", "Stored in Postgres."),
    ],
  },
  {
    id: "mock-interview",
    label: "Mock interview",
    era: "today",
    summary: "An AI interviewer asks, listens and pushes back. Code decides where the interview goes; the model only does the talking.",
    steps: [
      step("browser", "middleware", "You join the interview room. Your speech is turned into text in the browser."),
      step("middleware", "pages", "Each answer is sent to the room's server action."),
      step("pages", "interviewSvc", "The interview room takes the turn."),
      step("interviewSvc", "interviewDomain", "The engine decides what comes next and, in a case, checks the maths."),
      step("interviewSvc", "llm", "A small model phrases the interviewer's reply; a premium model writes the feedback at the end."),
      step("llm", "models", "The reply comes back, checked so it states no figure the case does not contain."),
      step("browser", "api", "The browser asks for the reply to be spoken."),
      step("api", "tts", "The voice adapter is called."),
      step("tts", "eleven", "ElevenLabs returns audio. Without it, the browser's own voice is used."),
      step("interviewSvc", "db", "The transcript and scores are saved. Audio never is."),
      step("db", "pg", "Stored in Postgres."),
    ],
  },
  {
    id: "overnight",
    label: "Overnight run",
    era: "future",
    summary: "Planned. While you sleep, the app finds new roles, reads them in the background and prepares a morning brief.",
    steps: [
      step("cron", "sourcing", "A schedule inside the app starts the refresh."),
      step("sourcing", "ats", "Watched companies' boards are read as today."),
      step("ats", "boards", "New postings come back."),
      step("sourcing", "queue", "Each new role is queued to be read, instead of waiting for a click."),
      step("cron", "queue", "A few minutes later the schedule takes a small batch from the queue."),
      step("queue", "intake", "Each role goes through the same role intake."),
      step("intake", "llm", "A small model reads it once."),
      step("llm", "models", "The structured result comes back."),
      step("cron", "brief", "The schedule builds the morning brief: new roles, follow-ups due, stale applications."),
      step("brief", "db", "The brief is saved for the dashboard."),
      step("db", "pg", "Stored in Postgres."),
    ],
  },
  {
    id: "improve-loop",
    label: "Learning from outcomes",
    era: "future",
    summary: "Planned. The app reads how your applications ended and tells you what to change.",
    steps: [
      step("browser", "middleware", "You open the Improve page."),
      step("middleware", "pages", "The page calls the improve service."),
      step("pages", "improve", "It gathers closed applications and practice scores."),
      step("improve", "db", "Outcomes are loaded."),
      step("db", "pg", "From Postgres."),
      step("improve", "pipeline", "Rules find where applications stall: by stage, sector or CV version."),
      step("improve", "llm", "One small model call turns the pattern into three concrete changes."),
      step("llm", "models", "The suggestions come back."),
    ],
  },
];

export function edgeKey(e: { from: string; to: string }): string {
  return `${e.from}>${e.to}`;
}

/** Today shows only what exists; the future view shows everything. */
export function nodesFor(era: Era): ArchNode[] {
  return era === "future" ? NODES : NODES.filter((n) => n.era === "today");
}

/** Today shows today's edges; the future view adds the planned ones and drops those that retire. */
export function edgesFor(era: Era): ArchEdge[] {
  return era === "future" ? EDGES.filter((e) => !e.retires) : EDGES.filter((e) => e.era === "today");
}

export function neighbours(id: string, era: Era): { in: string[]; out: string[] } {
  const edges = edgesFor(era);
  return {
    in: edges.filter((e) => e.to === id).map((e) => e.from),
    out: edges.filter((e) => e.from === id).map((e) => e.to),
  };
}

export interface Placed {
  x: number;
  y: number;
  z: number;
}
export interface PlacedLayer {
  y: number;
  /** Today's slab, centred on x = 0. */
  width: number;
  depth: number;
  /** The strip the planned nodes stand on, to the right of today's slab. */
  extension: { x: number; width: number };
}
export interface Layout {
  nodes: Map<string, Placed>;
  layers: Map<LayerId, PlacedLayer>;
}

const LAYOUT = { dx: 4.1, dz: 3.1, dy: 3.6, maxPerRow: 5, rows: 2, margin: 2, gap: 0.5 };

/**
 * Stacked slabs, one per layer, top to bottom. Today's nodes sit in centred rows on the
 * slab (one row up to five, two even rows beyond). Planned nodes stand on an extension to
 * the right of it, so today's picture is balanced on its own, nothing moves when the
 * future arrives, and growth reads as the layers getting wider.
 */
export function layoutGraph(): Layout {
  const grids = LAYERS.map((layer) => {
    const onLayer = NODES.filter((n) => n.layer === layer.id);
    const today = onLayer.filter((n) => n.era === "today");
    const first = today.length <= LAYOUT.maxPerRow ? today.length : Math.ceil(today.length / 2);
    const rows = [today.slice(0, first), today.slice(first)].filter((r) => r.length > 0);
    return { layer, rows, planned: onLayer.filter((n) => n.era === "future") };
  });
  const width = Math.max(...grids.flatMap((g) => g.rows.map((r) => r.length))) * LAYOUT.dx + LAYOUT.margin;
  const depth = LAYOUT.rows * LAYOUT.dz + LAYOUT.margin;
  const plannedCols = Math.max(...grids.map((g) => Math.ceil(g.planned.length / LAYOUT.rows)));
  const extWidth = plannedCols * LAYOUT.dx + LAYOUT.margin / 2;
  const extLeft = width / 2 + LAYOUT.gap;
  const top = ((LAYERS.length - 1) * LAYOUT.dy) / 2;
  const rowZ = (row: number, count: number) => (row - (count - 1) / 2) * LAYOUT.dz;

  const nodes = new Map<string, Placed>();
  const layers = new Map<LayerId, PlacedLayer>();
  grids.forEach(({ layer, rows, planned }, i) => {
    const y = top - i * LAYOUT.dy;
    layers.set(layer.id, { y, width, depth, extension: { x: extLeft + extWidth / 2, width: extWidth } });
    rows.forEach((row, r) => {
      row.forEach((n, col) => {
        nodes.set(n.id, { x: (col - (row.length - 1) / 2) * LAYOUT.dx, y, z: rowZ(r, rows.length) });
      });
    });
    const plannedRows = Math.min(planned.length, LAYOUT.rows);
    planned.forEach((n, k) => {
      const col = Math.floor(k / LAYOUT.rows);
      nodes.set(n.id, {
        x: extLeft + LAYOUT.margin / 4 + (col + 0.5) * LAYOUT.dx,
        y,
        z: rowZ(k % LAYOUT.rows, plannedRows),
      });
    });
  });
  return { nodes, layers };
}

const FLOW_LAYOUT = { dx: 4.8, dz: 2.9, dy: 3.4, maxPerRow: 4, margin: 2.2 };

/** The parts a flow touches, in the order it first reaches them. */
export function flowNodes(flow: Flow): ArchNode[] {
  const byId = new Map(NODES.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const out: ArchNode[] = [];
  for (const id of flow.steps.flatMap((s) => [s.from, s.to])) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(byId.get(id)!);
  }
  return out;
}

/**
 * A small diagram for one flow: only the layers it touches, top to bottom, and only its
 * own parts, left to right in the order the flow reaches them.
 */
export function layoutFlow(flow: Flow): Layout {
  const parts = flowNodes(flow);
  const used = LAYERS.filter((l) => parts.some((n) => n.layer === l.id));
  const grids = used.map((layer) => {
    const onLayer = parts.filter((n) => n.layer === layer.id);
    const rows: ArchNode[][] = [];
    for (let k = 0; k < onLayer.length; k += FLOW_LAYOUT.maxPerRow) rows.push(onLayer.slice(k, k + FLOW_LAYOUT.maxPerRow));
    return { layer, rows };
  });
  const width = Math.max(...grids.flatMap((g) => g.rows.map((r) => r.length))) * FLOW_LAYOUT.dx + FLOW_LAYOUT.margin;
  const depth = Math.max(...grids.map((g) => g.rows.length)) * FLOW_LAYOUT.dz + FLOW_LAYOUT.margin;
  const top = ((used.length - 1) * FLOW_LAYOUT.dy) / 2;

  const nodes = new Map<string, Placed>();
  const layers = new Map<LayerId, PlacedLayer>();
  grids.forEach(({ layer, rows }, i) => {
    const y = top - i * FLOW_LAYOUT.dy;
    layers.set(layer.id, { y, width, depth, extension: { x: 0, width: 0 } });
    rows.forEach((row, r) => {
      row.forEach((n, col) => {
        nodes.set(n.id, {
          x: (col - (row.length - 1) / 2) * FLOW_LAYOUT.dx,
          y,
          z: (r - (rows.length - 1) / 2) * FLOW_LAYOUT.dz,
        });
      });
    });
  });
  return { nodes, layers };
}
