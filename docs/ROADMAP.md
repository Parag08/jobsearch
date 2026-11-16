# JobSearch - roadmap

What to build next, and why. Written for Parag and for any Claude session deciding the next task.
The system design behind it - today, its weak points, and the target - is `docs/ARCHITECTURE.md`
(3D view: `/architecture`).

Last reviewed: 2026-11-16.

## 0. How to use and maintain this file

**Reading it.** A planning session reads sections 1-3 and picks from **Now**. Sections 4-9 are
reference: look up the track you are working in.

**Every item has an id** - a track letter and a number (`A1`, `P5`). Ids never change and are never
reused, so commits, the work log and `lib/architecture/graph.ts` can point at them.

| Track | Covers | Track | Covers |
|---|---|---|---|
| **S** | Sourcing | **X** | Cross-cutting product (brief, theme, landing) |
| **N** | Networking | **G** | Agent access (MCP) |
| **A** | Applying: CV, letter, export | **P** | Platform and architecture |
| **I** | Interview prep | **Q** | Quality, verification, security |
| **V** | Improve | **U** | Peers (multi-user) |
| **O** | Offer and negotiation | | |

**When something ships:**
1. Move its row in *Status by stage* (section 4) to Shipped with the date.
2. Strike it in Now / Next / Later and add a line to the log (section 9).
3. If it is a planned block in `lib/architecture/graph.ts`, flip `era` to `"today"` there.
4. If the landing page's process map (`app/_components/process-map.tsx`, `STAGES`) marks it `coming`,
   remove the flag. A step loses `coming` only when it is Shipped here.

**When adding an item:** next free number in its track, then: what, *why now*, size, dependencies,
and a **done when** that someone else could check. If there is no "done when", it is an idea - put it
in the backlog (section 7).

**Re-rank** Now / Next whenever the job search changes: a new target, an interview loop starting, an
offer. The ranking serves the search, not the product.

**Status words.** **Shipped** = a user can reach it in the app. **Built, not wired** = tested domain
code in `lib/` that no page, route or job calls. **Script only** = runs from `npm run`. **Not started**
= nothing in code. AI column: AI = model call; Rules = code, no tokens; You = the user.
**Size:** S = one session, M = two or three, L = a week of sessions.

## 1. Where it stands (2026-11-16)

```
  Sourcing -> Networking -> Applying -> Interview prep -> Offer & negotiation
     ^                                        |
     +------- Improve <---- not this time ----+
```

One record (bullet bank, stories, applications) feeds every stage; Improve writes back into it.

| Stage | State | The gap that matters most |
|---|---|---|
| Sourcing | Works; **the daily run is failing** | Missing repo secrets (S1) |
| Networking | Tables and rules only; contacts reachable only over MCP | No page at all (N1) |
| Applying | Works end to end: read, tailor, letter, export | Output is 7 of 12 against a hand-made CV; no honest rewording yet (A1, A2) |
| Interview prep | Strongest stage: behavioural mock, cases, delivery scoring, per-application prep | Stories cannot be captured in the app (I1) |
| Improve | Close with a reason, nothing else | No outcome record to learn from (V1) |
| Offer | Nothing | Waits for the framework or an offer (O1) |
| Agent access | MCP server, 10 tools, findparagjob syncing | Pushed roles are read five per click (P2) |
| Platform | 100 test files, CI, migrations, demo mode | No backups, no observability, verified on demo data only (P5, P3, Q1) |

Numbers worth tracking each review: test files 100 (840 tests); tables 20; migrations 0010; MCP tools 10;
benchmark 7/12 (AWS TAM); planned blocks in the architecture graph 14.

## 2. Horizons

A horizon is done when its exit test passes, not when its date arrives. Dates are guesses.

| Horizon | Theme | Exit test | Items |
|---|---|---|---|
| **H0 - Trust it** (this week) | Nothing silently broken or unverified | Sourcing has run green three mornings; insights and the board have been used signed in on real roles; live DB holds the current corpus; a restore from backup has been tried once | S1, Q1, A9, P5, X4 |
| **H1 - Daily driver** (to end 2026) | Parag runs the whole search here, not in findparagjob by hand | Two real applications sent with a CV and letter from this app, unedited outside it; every contact and conversation for a week logged here; the brief is the first page opened | A1, A2, A3, I1, N1, X1, V1, Q3 |
| **H2 - It learns** (Q1 2027) | The record improves the next application | Improve names a pattern from at least ten closed applications; practice is chosen by score; new roles arrive read and ranked without a click | V2, I3, I2, S2, S3, S4, P1, P2, P3, N2 |
| **H3 - Peers** (Q2 2027) | A second person can use it safely | A peer signs up from an invite, builds a bank from a CV, sends an application; their spend is capped; nothing of theirs is in the repo or the env | U1, U2, P4, P10, P11, P9, X3, Q2, P7 |
| **H4 - Platform** (later) | Wider intake and agents as first-class users | Claude connects over OAuth and can run the loop through tools | G1, G2, S5, S6, U3, U4, P6, O1-O3 |

**Measures** (all computable from the database; X5 puts them on a page):
- Applications sent per week, and median days from a role appearing to `applied`.
- Share of sent CVs that were exported from the app without a re-tailor.
- Response rate (reached screening or later) by role family and by master CV.
- Follow-ups overdue today. Practice sessions per week and the lowest-scoring dimension.
- Sourcing freshness: hours since the last successful refresh. Roles unread.
- Tokens per cycle and per month from `token_ledger`, by tier. Target stays $0 defaults, premium under a few dollars a month.
- Tailoring benchmark: stories matched against hand-made CVs (7/12 today; aim 10/12).

## 3. Now / Next / Later

### Now

Ranked. H0 first because the rest builds on data that must be right.

1. **S1 - Fix the daily sourcing run** (S). The `sourcing` workflow has failed every day since it
   shipped: repo secrets `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are not set.
   *Why now:* the watchlist is stale and nothing says so. *Done when:* three consecutive green runs,
   and `/app/watchlist` shows when the last refresh succeeded. *Touches:* GitHub repo secrets,
   `sourcing.yml`, a `last_refreshed_at` read on the page.
2. **A9 - Bring the live database up to the current corpus** (S). Live still holds the pre-11-Nov
   bullets, an empty taxonomy and no org caps, so live tailoring is weaker than demo.
   *Done when:* `npm run db:seed` has run against live after checking it will not overwrite in-app
   bullet edits; taxonomy and `org_caps` are present; the five `CV_*` selection values and the
   `nutanix-government-migration-recovery` tag fix (in findparagjob `points.json`) are in.
   *Risk:* seed upserts - diff the bullets table first.
3. **Q1 - Verify the last three features on real data** (S). Insights (Gaps / Unstated lists, "Read
   them", "Draft a plan"), the 7-day board and the compact board were checked on demo data only.
   *Done when:* each has been used signed in on the live site and the findings are in the work log.
4. **P5 - Nightly backup of what cannot be rebuilt** (S). *Why now:* interview answers, attempts, case
   sessions and contacts are hand-typed; the free tier has no backups. *Done when:* a scheduled job
   writes a dated dump of those tables to a private bucket, keeps 14, and one restore into a scratch
   project has been done and written up. *Touches:* new workflow or cron route, `scripts/`.
5. **X4 - Bring the landing page back in step** (S). `process-map.tsx` still marks "Retire roles that
   close" and "Draft the cover letter" as `coming`; both shipped 2026-11-11.
6. **I1 - Capture a STAR story in the app** (S). `draftStory` / `saveStory` exist; no form calls them,
   so prep shows "CV line only" or "gap" forever. *Done when:* a gap row on the application page
   opens a form, and the saved story appears in prep and in the interview room.
7. **Q3 - Tailoring benchmark as a test** (S-M). Turn the AWS TAM comparison into `npm run eval`: the
   hand-made CVs in `data/cvbuilder/applications` are the answers; the score is stories matched.
   *Why now:* A1 changes text with a model, and nothing today would catch it making a CV worse.
   *Done when:* the command prints a score per application and CI fails below a floor.
8. **A1 - Honest rewording** (M). Premium model rewrites a chosen bullet toward the posting,
   constrained to the bullet's own facts (findparagjob `docs/cv-writing.md` sections 3-5: XYZ form,
   numbers unchanged, last line at least half full), checked by code before it is kept; "system
   proposes, you edit". *Deps:* Q3. *Done when:* a reworded bullet shows original and proposal side
   by side, a changed number or an unevidenced tool is rejected by a test, and the benchmark does
   not drop.
9. **N1 - Networking, minimum CRM** (M). A contacts page (add by name or pasted LinkedIn URL, firm,
   office, warmth), an interaction log that sets `nextFollowupDate`, and contacts shown on watched
   companies. Tables, repo, follow-up rules and MCP tools already exist. *Done when:* the follow-ups
   due count on the pipeline links to real rows a user created in the app.
10. **X1 - Morning brief on `/app`** (S). Surface `/api/brief` (new roles, follow-ups due, stale
    applications) as the first thing on the dashboard. In-app only. *Deps:* S1; better with N1.
11. **V1 - Record outcomes properly** (S). Stage reached, who closed it, free notes, per application
    (answers DESIGN section 7 Q7). Everything else in Improve reads this.

### Next

12. **A2 - Port the page layout and measurement** (M). findparagjob `render.js` / `metrics.js`: the
    INSEAD one-page format and the photo. Replaces the calibrated `CV_OVERHEAD_LINES` estimate.
13. **A3 - Wire the collision audit** (S). `lib/editorial/audits.ts` is tested and unused.
14. **P1 - Schedules move into the app** (S-M). `/api/cron/{sourcing,brief,jobs}` behind
    `CRON_SECRET`; trigger from Vercel Cron if the plan's frequency and duration limits fit, else
    from the existing GitHub workflow calling the route. *Deps:* S1.
15. **P2 - Job queue** (M). A `jobs` table drained in batches by a cron route; first jobs are "read
    this role" and "refresh this company". Replaces `ROLE_READ_BATCH` clicking. *Deps:* P1.
16. **S4 - Give the extractor the user's own role families** (S). Today "forward-deployed-engineering"
    can arrive as "engineering"; the title filter covers for it.
17. **S3 - High scorers become `saved` applications** (S). Decided 2026-11-10; set the threshold here.
18. **S2 - "Why this fits you"** (S). Two lines per shortlisted role, small tier, above a score
    threshold, from bullet ids not documents.
19. **V2 - Pattern and pointers** (M). Rules first (where applications stall by stage, sector, CV
    variant), then one small-tier call that turns the pattern into three concrete changes. *Deps:* V1
    and about ten closed applications.
20. **I2 - Link answers to CV bullets** (S). So `numberConsistency` checks spoken numbers against the CV.
21. **I3 - Drill the weakest dimension** (S). Choose practice from the lowest scores in
    `interview_attempts` and `case_sessions`.
22. **N2 - Draft the first message** (S-M). `buildMessageContext` exists; needs a provider method on the
    premium tier and the voice checks the letters use. *Deps:* N1.
23. **P3 - Observability and a usage page** (M). Errors and slow calls kept beyond Vercel's hour;
    `/app/usage` over `token_ledger` with the budget from `lib/token-meter.ts`.
24. **A4 - Cover letter learns from the sent letters** (M). The private corpus, kept in a per-user
    bucket, never in the repo.
25. **G1 - More MCP tools** (S each). `tailor_cv`, `export_cv`, `daily_brief`, `draft_story`. Each
    goes through the same service the page uses.
26. **Q4 - Test that every MCP tool filters on the user** (S). A FakeDb with two users; each tool
    called as user A must never return user B's rows.

### Later

27. **O1-O3 - Offer and negotiation** (M). Target package at onboarding (O1), the framework as DATA
    like `cases.json` (O2, Parag supplies it), rehearsal on the case-room loop (O3).
28. **U1-U4 - Peers.** Invites and per-user settings (U1), onboarding from a CV or LinkedIn upload
    (U2, `mergeSkeletons` + provenance guard; resolve DESIGN section 7 Q1 first), per-geography source
    packs (U3), shareable templates (U4).
29. **P4 - Limits and budgets** (M), **P10 - settings as data** (M), **P11 - RLS on the agent path**
    (M), **P9 - corpus out of the public repo** (S-M), **P7 - a staging project** (S). All before a
    second user.
30. **P6 - Semantic matching with pgvector** (M-L). Only if the benchmark shows paraphrase misses.
31. **S5 - Broad sourcing through aggregators** (M), **S6 - role capture bookmarklet** (S-M),
    **S7 - more board kinds** (S each: Workday, Workable, Teamtailor), **S8 - a page for the
    sector graph** (S).
32. **G2 - OAuth for remote MCP** (M). So Claude and other hosted clients can connect without a pasted token.
33. **Q2 - End-to-end smoke test** (M). One browser run through sign-in, paste, tailor, export on a
    staging project. *Deps:* P7.
34. **X3 - theme per account** (S), **X5 - measures page** (S-M), **I4 - more cases** (S each),
    **P8 - prompt caching with stable prefixes** (S), **A8 - reuse the diff for near-duplicate postings** (S).

## 4. Status by stage

### Sourcing

| Capability | Status | AI | Where |
|---|---|---|---|
| Company catalogue + which ATS each runs | Shipped (sync is a script) | Rules | `lib/companies`, `lib/watchlist/ats.ts`, `npm run companies:sync`, `/app/watchlist` |
| Watch / unwatch companies | Shipped | You | `/app/watchlist`, `actions.ts` |
| Pull every open role from company boards | Shipped | Rules | `lib/services/refresh-watchlist.ts`, `lib/watchlist/{fetcher,mappers,identity}.ts`; Greenhouse, Lever, Ashby, SmartRecruiters |
| Filter to city + line of work | Shipped 2026-09-25 | Rules | `lib/watchlist/targets.ts`, profile `target_geos` / `target_titles` / `excluded_titles` (0003) |
| Fit score (sector, skills, network, location, target boost) | Shipped | Rules | `lib/scoring.ts`, `lib/watchlist/scoring.ts` |
| Scheduled refresh | Shipped 2026-11-11, **failing: no repo secrets** (S1) | Rules | `.github/workflows/sourcing.yml`, daily 07:07 SGT |
| Retire roles that close | Shipped 2026-11-11 | Rules | `lib/watchlist/retire.ts` (0004) |
| Roles pushed by an agent | Shipped 2026-11-13 | Rules | `upsert_application` over MCP |
| Read every role into structure | Shipped 2026-11-14 (five per click) | AI (small) | `lib/services/read-role.ts`; queue in P2 |
| What roles ask for, against your record | Shipped 2026-11-14, unverified on real data (Q1) | Rules + AI (premium, plan) | `lib/insights/*`, `/app/insights`, `role_plans` (0010) |
| "Why this role fits you" | Not started (S2) | AI | - |
| High scorers auto-saved | Not started (S3) | Rules | - |
| Broad aggregator feed (Adzuna) | Built, not wired (S5) | Rules | `lib/adapters/adzuna.ts` |
| Sector graph view | Built, invisible (S8) | Rules | `lib/sector-graph.ts` learns from every posting; no page |

### Networking

| Capability | Status | AI | Where |
|---|---|---|---|
| Contacts + interactions tables | Shipped (schema, repo) | - | `contacts`, `interactions`; `lib/repos/contacts.ts` |
| Contacts and interactions over MCP | Shipped 2026-11-13 | Rules | `list/get/upsert_contact`, `log_interaction` |
| Follow-ups due count on the pipeline | Shipped, but no way to add a contact in the app | Rules | `lib/outreach.ts` `followupsDue` |
| Contacts page / CRM UI | Not started (N1) | - | - |
| Log conversations, next follow-up date | Built, not wired (N1) | Rules | `lib/outreach.ts` `nextFollowupDate` |
| Draft the first message | Built, not wired (N2) | AI | `buildMessageContext`; `draft-outreach` tier, no provider method |
| Find alumni at a watched firm | Not started; contacts are typed or pasted, never fetched | You | decided 2026-11-10 |

### Applying

| Capability | Status | AI | Where |
|---|---|---|---|
| Paste a posting -> structured extract, stored once | Shipped | AI (small) | `app/app/jd-form.tsx`, `lib/services/{process-jd,read-role}.ts`, `/api/jd` |
| Evidence vs gap chips per skill | Shipped | Rules | `lib/editorial/gaps.ts` on `/app/applications/[id]` |
| Score bullets through the taxonomy | Shipped 2026-11-11 | Rules | `lib/editorial/score.ts`, `profiles.taxonomy` (0008); live taxonomy empty until A9 |
| Select from the whole bank under caps and balance rules | Shipped 2026-11-11 | Rules | `lib/editorial/auto-select.ts`; `CV_MAX_BULLETS` etc. |
| Per-org cap, short variant before cut, page fit | Shipped 2026-11-11 | Rules | `composeSelection`, `fitToPage`; `org_caps` (0005) |
| Collision audit | Built, not wired (A3) | Rules | `lib/editorial/audits.ts` |
| Honest rewording per application | Not started (A1) | AI (premium) | - |
| Exact page layout (INSEAD one-page, photo) | Not started (A2) | Rules | port of findparagjob `render.js`, `metrics.js` |
| Mark applied -> freeze the sent CV | Shipped | You | `lib/services/mark-applied.ts`, `lib/freeze.ts` |
| Stale (14 days) and follow-up flags | Shipped | Rules | `lib/pipeline.ts` |
| Board: last week, busy stages only | Shipped 2026-11-15, unverified on real data (Q1) | Rules | `PIPELINE_RECENT_DAYS`, `PIPELINE_COLUMN_MAX` |
| Cover letter from the honest gaps | Shipped 2026-11-11 | AI (premium) | `lib/cover-letter`, `applications.cover_letter` (0007) |
| Letter informed by the sent letters | Not started (A4) | AI | private corpus, not in the repo |
| DOCX / PDF export | Shipped 2026-11-11 | Rules | `lib/export/*`, `/api/export/<id>`, bucket `cv-exports` (0006) |
| CV corpus sync from findparagjob | Script only; live not reseeded (A9) | Rules | `npm run data:sync`, `seed:build`, `db:seed` |
| CV / LinkedIn upload at onboarding | Built, not wired (U2) | AI | `lib/onboarding/skeleton.ts`, `intake-guard.ts` |
| Bank readiness + nudges | Shipped | Rules | `lib/onboarding/{readiness,nudges}.ts` on `/app/bank` |

### Interview prep

| Capability | Status | AI | Where |
|---|---|---|---|
| Behavioural bank, generic questions | Shipped | You | `data/interview/questions.json`, `/app/interview` |
| Company questions from your pipeline | Shipped 2026-11-10 | Rules | `lib/interview/company-questions.ts` |
| Written answer, blank or STAR | Shipped | You | `answer-editor.tsx`, `interview_answers` |
| Behavioural mock: pushback, follow-ups, debrief | Shipped 2026-11-11 | Rules + AI | `lib/interview/mock.ts`, `mock-interview.tsx` |
| Interviewer as an animated agent, optional ElevenLabs voice | Shipped 2026-11-11 | AI (TTS) | `agent-avatar.tsx`, `lib/adapters/elevenlabs.ts`, `/api/tts` |
| Delivery measured from your voice | Shipped 2026-11-10 | Rules + AI (premium) | `lib/interview/{voice,score}.ts` |
| Live case interviewer (10 cases) | Shipped; production needs `AI_GATEWAY_API_KEY` | AI | `lib/interview/case-*.ts`, `data/interview/cases.json` |
| Technical tab (claims from the CV) | Shipped | Rules | `lib/interview/technical.ts` |
| Prep for this exact application | Shipped 2026-10-29 | Rules | `lib/stories/{prep,prep-view}.ts` |
| Capture a STAR story in the app | Not started (I1) | You | `lib/repos/stories.ts` has `draftStory` / `saveStory` |
| Answers checked against CV numbers | Built, not wired (I2) | Rules | `lib/stories/consistency.ts` |
| Drill the weakest dimension | Not started (I3) | Rules | data exists in `interview_attempts`, `case_sessions` |

### Improve

| Capability | Status | AI | Where |
|---|---|---|---|
| Close an application with a reason | Shipped | You | `moveStage` + `ClosedReason` |
| Gap plan across roles | Shipped 2026-11-14 | AI (premium) | `lib/services/role-plan.ts` |
| Record the stage reached + notes | Not started (V1) | You | - |
| Pattern across outcomes | Not started (V2) | Rules + AI | - |
| Improvement pointers | Not started (V2) | AI | - |

### Offer and negotiation

| Capability | Status | AI | Where |
|---|---|---|---|
| Target package captured | Not started (O1) | You | - |
| Compare offer against target | Not started (O1) | You | - |
| Negotiation framework | Not started; Parag to supply (O2) | You | - |
| Rehearse the call with an AI counterpart | Not started (O3) | AI | reuse the case-room turn loop |

### Agent access, platform, cross-cutting

| Capability | Status | Where |
|---|---|---|
| MCP server, personal tokens | Shipped 2026-11-13 | `/api/mcp`, `lib/mcp`, `/app/agent`, `api_tokens` (0009) |
| findparagjob push / pull | Shipped 2026-11-13 | `tools/portal-sync` in that workspace |
| Google sign-in, One Tap, session kept alive | Shipped 2026-11-11 / 13 | `lib/auth`, `middleware.ts` |
| Morning brief | Built, not wired (X1) | `lib/services/daily-brief.ts`, `/api/brief` |
| Token ledger | Logging shipped; no view (P3) | `withLedger`, `lib/token-meter.ts` |
| Theme saved per account | Not started (X3); per browser today | `lib/theme.ts` |
| CI: tests, typecheck, build; migrations on push; keepalive | Shipped | `.github/workflows/*` |
| Architecture as data + 3D page, one diagram per flow | Built 2026-11-16 (local; not yet deployed) | `lib/architecture/graph.ts`, `/architecture` |
| Backups, observability, limits, queue, cron routes | Not started | P5, P3, P4, P2, P1 |

## 5. Risks and debt

| Risk | Likelihood | Cost if it happens | Guard |
|---|---|---|---|
| Hand-typed interview data lost | Low | High, unrecoverable | P5 |
| Free database pauses after ~7 idle days | Medium | Sign-in fails until restored; data survives | `keepalive.yml`; restore steps in CLAUDE.md |
| GitHub disables scheduled workflows after 60 days without a push | Medium once the build slows | Sourcing and keepalive stop silently | P1; show last-refresh time (S1) |
| A model rewrites a CV line into something untrue | Medium once A1 ships | Reputational | Honesty rule in code; Q3 before A1 |
| Cross-tenant leak through MCP | Low today (one user) | High with peers | Q4, then P11 |
| Seed overwrites an in-app bullet edit | Medium | Lost edits | Diff before A9; decide corpus ownership per table (P9) |
| Provider free tier changes | Medium | Extraction stops | Router falls back across providers; keep two small-tier keys |
| The roadmap, landing map and graph drift apart | High without discipline | The public page promises what is not built | Section 0 checklist; `graph.test.ts` |

Debt, small and known: the sector graph mutates its node (documented); `/api/cv-diff` predates the
editorial layer; `scripts/source-singapore.ts` overlaps the watchlist refresh; role family is a free
label (S4); `CV_OVERHEAD_LINES=21` is calibrated, not measured (A2).

## 6. Open questions for Parag

- **Negotiation framework:** what form will it come in, so the data shape can be ready? (O2)
- **Corpus ownership long term:** does findparagjob stay the source of truth, or does the bank become
  editable here first once A1 and A2 land? Decides P9 and how A9 treats in-app edits.
- **Schedules:** is a daily Vercel Cron enough, or should GitHub keep triggering (P1)? Check the
  current plan's cron frequency and function-duration limits before choosing.
- **Peers:** invite-only or self-serve (SPEC section 10 Q7)? Sign-up is technically open today.
- Still open from the design docs: DESIGN section 7 Q1 (does intake capture STAR material), Q3
  (premium polish cap), Q5-6 (story scope, predicted questions), Q8-10 (company list, ATS mapping,
  dedupe identity); `docs/ONBOARDING.md` section 6.

## 7. Idea backlog (unranked, no "done when" yet)

Promote one by giving it an id, a size and a done-when.

- A weekly review page: what moved, what stalled, what to do Monday.
- Calendar: put follow-ups and interviews on Google Calendar from the pipeline.
- Email: detect recruiter replies and propose the stage move (read-only, user confirms).
- Company page: everything known about one firm - roles, contacts, conversations, questions asked.
- Salary data per role family and city, as a source pack.
- Singapore source pack: MyCareersFuture, EP / COMPASS notes.
- Interview: record which questions a real interview asked and feed them back into the bank.
- Interview: streaming speech-to-speech for a more natural mock.
- CV: a "what changed and why" sheet attached to each export.
- Export the whole workspace as JSON (and import it): the exit door peers will ask for.
- Anonymous, opt-in pooling of skill frequencies per sector across users (SPEC section 7).
- Installable PWA with the brief as the home screen.

## 8. Decided, and not doing

**Decided with Parag**
- **Networking source (2026-11-10):** contacts are added by typing a name or pasting a LinkedIn URL.
  The URL is stored as a link only - never fetched or scraped.
- **Cover letters (2026-11-10):** the sent letters may be used as a corpus, kept private, not in this repo.
- **Tailoring (2026-11-10):** system proposes, you edit.
- **Sourced jobs (2026-11-10):** high scorers auto-create `saved` applications; threshold set in S3.
- **Brief delivery (2026-11-10):** in-app only, no email.
- **Ownership (2026-11-13):** findparagjob owns the CV corpus; this app owns stage and contacts.
- **Public repo with personal data (2026-11-11):** accepted for now; P9 is optional.
- **`/architecture` (2026-11-16):** public, and one small diagram per flow rather than one big picture.

**Parked / not doing**
- Scraping LinkedIn or any site that forbids it.
- WhatsApp delivery of the brief - no free, reliable channel.
- Premium "polish" of the whole CV - conflicts with diff-from-master and the honesty rule. Line-level
  rewording (A1) is the allowed form.
- Storing interview audio - transcripts only.
- Splitting the app into services or adding a separate worker (ARCHITECTURE section 3).

## 9. Log

- 2026-09-24 - first version, written against the code at commit `1e51c90`.
- 2026-09-25 - sourcing filter shipped (profile targets, shared by app and script).
- 2026-10-29 - application-scoped interview prep shipped on `/app/applications/[id]`.
- 2026-11-10 - behavioural mock interview with follow-ups and ElevenLabs voice built. Cases are done
  for Parag: interview work now focuses on behavioural.
- 2026-11-10 - Parag answered five open questions; negotiation framework still TBD.
- 2026-11-11 - automatic sourcing (retire + daily cron), a sendable CV (editorial layer, export),
  cover letters, taxonomy scorer and whole-bank selection shipped.
- 2026-11-13 - MCP server and findparagjob sync shipped.
- 2026-11-14 - role knowledge base (read pushed roles, insights, gap plan) shipped.
- 2026-11-15 - compact pipeline board shipped.
- 2026-11-16 - roadmap rewritten: item ids, horizons with exit tests, measures, risks, idea backlog.
  `docs/ARCHITECTURE.md` and the 3D `/architecture` page added. Old numbering maps as: 5 -> N1,
  6 -> V1, 7 -> V2, 8 -> I2, 9 -> I3, 10 -> S2, 11 -> X1, 12 -> O1-O3, 13 -> U2, 14 -> U1,
  15 -> I4, 16 -> S5.
