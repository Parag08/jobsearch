# JobSearch - architecture, today and planned

How the system is put together, where it is weak, and what it should grow into. The companion to
`docs/ROADMAP.md`: every planned change here carries the id of the roadmap item that builds it.

**See it in 3D:** run the app and open `/architecture` (public page, Three.js). It shows one small
diagram per flow - only the parts that flow touches, walked step by step with a sentence for each -
and "Whole system" as the last choice, with a Today / Future switch. That page and this file describe
the same graph, and the graph lives in one place: `lib/architecture/graph.ts`.

**Adding a flow:** append to `FLOWS` there (id, label, era, summary, steps with a plain-language `say`).
Keep it to one job and at most twelve parts - the tests enforce both the size and that every step
walks an edge that exists. Split a flow rather than grow it.

**Keeping it current.** When a planned part ships: in `graph.ts` set the node's `era` to `"today"` and
its `status` to `"live"` (same for its edges), move its row below from *Planned* to *Today*, and strike
the roadmap item. `lib/architecture/graph.test.ts` fails if an edge points at a node that does not
exist, a today edge touches a planned node, or a traced flow walks an edge that is not there.

Last reviewed: 2026-11-16.

## 1. Today

One Next.js app on Vercel (Singapore), one Supabase project (Postgres + Auth + Storage, Singapore), and
a pure domain layer between them. A modular monolith: seven layers, calls only go down.

```
 CLIENTS            Browser                         AI agent (MCP client, personal token)
                       |                                   |
 NEXT.JS / VERCEL   Middleware -> Pages + server actions   MCP server (/api/mcp)     API routes
 (sin1)             (session)     (app/app/**)             10 tools, JSON-RPC        jd, cv-diff, brief,
                       |                                   |                         export, tts
 SERVICES           Role intake . CV tailoring . Cover letter . Export . Sourcing refresh
 lib/services       Interview room . Role insights + plan . Agent sync . Morning brief*
                       |
 DOMAIN (pure)      Editorial rules . Matcher + CV diff (honesty rule) . Pipeline
 lib/**             Fit + watchlist rules . Interview engine . Stories + prep . Sector graph
                       |
 PORTS + ADAPTERS   Workspace + repos . LLM router (small / premium, ledger) . File store
                    Board fetcher . Voice adapter
                       |
 DATA + PROVIDERS   Supabase Postgres (20 tables, RLS) . Supabase Auth . Supabase Storage
                    Gemini / Groq / Anthropic / AI Gateway . ElevenLabs . Company job boards

 AUTOMATION         GitHub Actions: ci, db migrate, daily sourcing, keepalive
 + SOURCES          findparagjob corpus -> data:sync -> seed:build -> db:seed
                                                                    * built, not wired
```

### Layers

| Layer | What lives there | Rule it keeps |
|---|---|---|
| Clients | Browser (landing, `/app`); an agent with a personal token (today: findparagjob `portal:push` / `portal:pull`) | Agents get tools, never the database |
| Next.js on Vercel | `middleware.ts`, `app/app/**` pages + `actions.ts`, `app/api/*`, `/api/mcp` | Pages and routes call `getWorkspace()` and services, nothing else. Functions run in `sin1`, next to the database |
| Services | `lib/services/*`: one use case each | The only place I/O is composed. A service takes its ports as arguments, so it runs against FakeDb in tests |
| Domain | `lib/editorial`, `bullet-matcher`, `cv-diff`, `pipeline`, `scoring`, `watchlist`, `interview`, `stories`, `insights`, `sector-graph`, `outreach`, `onboarding` | Pure: no I/O, no framework imports, a test beside every file. The honesty rule lives here |
| Ports and adapters | `lib/db`, `lib/repos`, `lib/adapters/*`, `lib/export/file-store.ts`, `lib/watchlist/fetcher.ts` | The only code that knows a vendor. One file per provider |
| Data and providers | Supabase, model providers, ElevenLabs, ATS boards | `user_id` + RLS on every table; schema changes only by numbered migration; $0 defaults |
| Automation and sources | `.github/workflows/*`, `scripts/*`, the findparagjob workspace | The CV corpus has one owner (findparagjob); stage and contacts have one owner (this app) |

### The flows worth knowing

The page draws each of these separately (posting to CV is three diagrams there: read, tailor, export),
plus two planned ones: the overnight run and learning from outcomes.

1. **Posting to a CV you can send.** Browser -> pages -> role intake (one small-model call, stored as a
   `JdExtract`) -> tailoring (rules only: score through the taxonomy, select under caps, fit the page,
   store a diff) -> export (resolve once, render DOCX and PDF, copy to the private bucket).
2. **An agent pushes a role.** Agent -> `/api/mcp` -> agent sync (idempotent on `external_ref`, never
   moves a stage) -> the same role intake. This path uses the secret key, so RLS does not apply and
   every repo call must filter on the token's user id.
3. **Daily sourcing.** GitHub Actions 07:07 SGT -> `watchlist:refresh` -> each watched company's own
   board -> filter to the profile's cities and titles -> score -> retire roles missing twice.
4. **Mock interview.** Pages -> interview room -> the engine owns the path and the maths, a small model
   talks each turn, a premium model writes the debrief; the voice is optional.

### What is deliberately simple

- **No queue, no worker, no cache service.** Everything is a request or a GitHub cron.
- **No SDK for MCP or for models.** Hand-rolled JSON-RPC and thin `fetch` adapters keep the dependency
  list at ten packages and zod on v3.
- **Settings are environment variables** (`CV_*`, `PIPELINE_*`, `ROLE_*`), read through one settings
  function per feature. Unset means the feature is off, never a hidden default.
- **Demo mode** is the same app with an in-memory database, which is also what the tests use.

## 2. Where today's design is weak

Ranked by how soon it will hurt. Each has the roadmap item that answers it.

| # | Weakness | Evidence | Answer |
|---|---|---|---|
| W1 | Schedules live outside the app and need their own secrets | The daily `sourcing` workflow fails every run: repo secrets `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are missing (noted 2026-11-14) | S1 now, P1 after |
| W2 | Hand-typed data has no backup | `interview_answers`, `interview_attempts`, `case_sessions`, contacts cannot be regenerated; the free tier keeps no backups and pauses when idle | P5 |
| W3 | Slow work runs inside a button press | Reading pushed roles is capped at `ROLE_READ_BATCH=5` per click; a full refresh runs in a server action under the function time limit | P2 |
| W4 | Nothing is observable after an hour | Vercel Hobby keeps about one hour of logs; no error tracker; the token ledger is written and never shown | P3 |
| W5 | Features are verified on demo data only | Insights lists, both insight buttons and the compact board have not been checked signed in against real roles | Q1, Q2 |
| W6 | The agent path is isolated by convention | `/api/mcp` bypasses RLS; safety is "every tool filters on userId". One forgotten filter is a cross-tenant leak | Q4, P11 |
| W7 | Two copies of the CV corpus | findparagjob -> `data:sync` -> seed -> a manual `db:seed`; the live database still holds the pre-11-Nov corpus and an in-app bullet edit can be overwritten | A9 now, P9 later |
| W8 | No limit on token-spending routes | Sign-up is open; `/api/jd`, scoring and the interviewer spend the owner's keys | P4 |
| W9 | Per-user choices are deployment settings | `CV_MAX_BULLETS`, `PIPELINE_RECENT_DAYS` and friends are one value for everyone | P10 (before peers) |
| W10 | Matching is lexical | Tags plus word echo: a posting that says it differently misses the evidence; the role family is the extractor's free label | S4, P6 |
| W11 | Prompt and rule changes have no regression check | The AWS TAM benchmark (7 of 12 stories) is a note in the work log, not a test | Q3 |
| W12 | Personal data sits in a public repo | `data/cvbuilder` holds phone, email and every bullet. Accepted for now (2026-11-11) | P9 |

## 3. Planned

The shape does not change: still one app, one database, calls going down. The future adds four kinds
of thing, each plugging into a layer that already exists.

```
 CLIENTS            Browser . AI agent              + Peer workspaces (U1) . Role capture (S6)
 NEXT.JS / VERCEL   Middleware . Pages . API . MCP  + Cron routes (P1) . Limits + budgets (P4)
 SERVICES           (nine today)                    + Outreach CRM (N1) . Improve loop (V1)
                                                      Offer + negotiation (O1)
 DOMAIN             (seven today)                   + Semantic match (P6)
 PORTS + ADAPTERS   db . llm . files . ats . tts    + Job queue (P2) . Traces + error log (P3)
 DATA + PROVIDERS   Postgres . Auth . Storage ...   + pgvector (P6) . Nightly backup (P5)
                                                      Aggregator feeds (S5)
 AUTOMATION         GitHub Actions . corpus         + Eval harness (Q3)
```

### The changes, and when to make each

| Change | What it is | Make it when | Item |
|---|---|---|---|
| **Close the loop** | Services for the three stages with no code path: outreach, improve, offer. The domain rules for outreach already exist | Now for outreach and outcomes; offer when one is near | N1, V1, O1 |
| **Schedules move into the app** | `app/api/cron/*` guarded by `CRON_SECRET`, triggered by Vercel Cron or, if the plan's limits do not fit, by the existing GitHub workflow calling the route. The run then uses the app's own code, region and secrets | As soon as S1 is fixed and the brief has a page | P1 |
| **Slow work goes to a queue** | A `jobs` table (kind, payload, state, attempts, run_after) drained in small batches by a cron route. First jobs: read a pushed role, refresh one company | When an agent pushes more roles than a person will click through, or a refresh nears the time limit | P2 |
| **See what happened** | Errors and slow calls kept in an `app_events` table (or a free log drain), plus `/app/usage` over `token_ledger` | Before peers; sooner if a production bug costs more than an hour to find | P3 |
| **Protect the keys** | Per-user rate limits on token-spending routes and MCP; a monthly budget read from the ledger | Before inviting anyone | P4 |
| **Back up what cannot be rebuilt** | Nightly dump of the hand-typed tables to a private bucket, with a restore drill | Now. Cheap, and the risk is real today | P5 |
| **Match by meaning** | Embeddings for bullets and role extracts in pgvector; widens the shortlist the rules then judge. Rules stay first and the honesty rule still decides | When the benchmark shows misses that are paraphrase, not selection | P6 |
| **Prove changes** | `evals/` with golden cases: hand-made CVs for tailoring, fixed postings for extraction, fixed transcripts for scoring; run on prompt or rule changes | Before the honest-rewording work (A1), which is the first prompt that can damage a CV | Q3 |
| **Settings become data** | A `user_settings` row per profile replaces per-user environment values; the env value stays as the deployment default | Before peers | P10 |
| **RLS on the agent path** | Mint a short-lived user-scoped JWT from the agent token so Postgres enforces isolation, instead of every repo remembering to filter | Before a second user holds an agent token | P11 |
| **Broader intake** | Aggregator feeds for firms off the watchlist; a capture bookmarklet | Only once the watchlist is clean and read daily | S5, S6 |
| **Peers** | Invites, onboarding from a CV upload, per-geography source packs | After the loop works end to end for one person | U1-U4 |

### What should not change

- **The monolith.** No services split out, no separate worker deployment. A queue table and cron
  routes cover everything on the list.
- **Calls go down.** A domain file never imports an adapter; a page never imports a repo.
- **Parse once.** Raw posting text enters a prompt exactly once.
- **Rules before models, and the ledger sees every call.**
- **$0 defaults.** Each planned part has a free path: Postgres tables for the queue and events,
  pgvector inside Supabase, GitHub or Vercel for schedules.
- **No scraping, no stored audio.**

## 4. Decisions on record

Short, so the reasoning is not re-litigated. Add a line when a structural choice is made.

| Date | Decision | Why |
|---|---|---|
| 2026-09-02 | Supabase in Singapore, functions pinned to `sin1` | Every query was a US-Singapore round trip on the default region |
| 2026-09-24 | Schema changes only through numbered, idempotent migrations | Interview answers are hand-typed and cannot be regenerated |
| 2026-11-11 | findparagjob owns the CV corpus; one-way sync in | Its CVs were better than this app's; one source avoids drift |
| 2026-11-13 | MCP server hand-rolled, stateless, token auth | No SDK dependency; agents get rules, not table access |
| 2026-11-13 | Stage and contacts are owned by this app | An agent may propose; only a dated, evidenced call moves a stage |
| 2026-11-14 | One place reads a posting (`read-role.ts`) | Pasted and pushed roles must produce the same structure |
| 2026-11-16 | Architecture kept as data (`lib/architecture/graph.ts`) and drawn from it | A diagram that is not generated goes stale; this one is tested |
| 2026-11-16 | `/architecture` shows one diagram per flow; the whole system is the last option | The full 49-part picture was too much to take in at once (Parag) |
| 2026-11-16 | `/architecture` is public | Parag's call; it reads no user data |
