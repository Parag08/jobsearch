# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state.

## 2026-08-29 - Session 2: repository layer (TDD)

**Done**
- Verified handoff baseline: npm install, 44 tests green, tsc clean. (This machine had no Node at all - installed Node 22 LTS locally to `~/.local/node`; shells need `export PATH="$HOME/.local/node/bin:$PATH"`.)
- Repository layer, red->green: **77 tests, 19 files, all passing; tsc clean.**
  - `lib/repos/db.ts`: `DbClient` - a structural subset of the supabase-js query chain (`from().select().eq()...single()`, insert/upsert/update/delete). Repos are written against this interface only; the real SupabaseClient satisfies it structurally once connected. `RepoError` + `one/oneOrNull/many` unwrap helpers - raw `{data,error}` never leaks upward.
  - `lib/repos/rows.ts`: row types mirroring supabase/schema.sql + all snake<->camel mappers in one place; zod-parse on every read.
  - `lib/repos/fake-db.ts`: in-memory `FakeDb` test double (the FakeLlm pattern for the DB) - upsert onConflict with SQL null-distinct semantics, single/maybeSingle, generated ids, detached result copies. Tested in its own right (fake-db.test.ts).
  - Per-table repos: sectors, applications, projects+bullets, cvs (master + application), contacts+interactions, sourced-jobs, briefs, token-ledger, profiles. Every query filters by user_id explicitly (defense in depth on top of RLS).
- Service layer, red->green: **83 tests, 22 files, all passing; tsc clean.**
  - `lib/services/process-jd.ts`: extract once -> merge sector -> open 'saved' application (raw JD = DB-only audit copy).
  - `lib/services/tailor-cv.ts`: score bank vs stored extract -> buildDiff/applyDiff (honesty rule enforced by buildDiff) -> persist application_cv -> link cv_id. No LLM in this path.
  - `lib/services/daily-brief.ts`: due follow-ups + stale applications (staleness measured from appliedAt, per pipeline) + top-3 new sourced jobs; upserts one brief per (user, date).
- API route shells: app/api/{jd,cv-diff,brief}/route.ts return 503 with a pointer to the tested service each will call once Supabase is connected.

**Decisions**
- Inserts omit domain ids: slugs from findOrCreateNode and adapter-synthesized sourced-job ids are provisional; the DB uuid comes back on the returned object and is the identity from then on.
- jd_raw goes in at insertApplication as a separate audit-only argument and never re-enters the domain object; interactions raw_text likewise stays in the DB.
- listContacts returns contacts without interaction logs; getContact composes them (newest first) for buildMessageContext.
- No @supabase/supabase-js dependency yet - added only when Wani connects Supabase; then a thin `createDb()` that returns the real client typed as DbClient.

**Blocked / for Wani**
- `git push origin main` fails: no git credentials available on this machine (no gh CLI, no keychain entry for github.com - "could not read Username"). All work is committed locally (7 commits). Log in (e.g. `gh auth login` or a credential-helper PAT) and push; collaborator access on Parag08/jobsearch may also still be needed.

**Next (in order)**
1. Wani: push to GitHub (see above), connect Supabase (run schema.sql, confirm clean) and Vercel.
2. Wire the API routes: add @supabase/supabase-js, a `createDb()` returning the client as DbClient, auth'd user_id from the Supabase session; replace the 503 shells with calls into lib/services/*.
3. Real LlmProvider impls: Gemini free tier first, Groq fallback, behind routeModel; wire token_ledger via logTokens (needs API keys).
4. UI: pipeline board, contacts, projects (port the Cowork dashboard artifact's layout).
5. Sourcing cron (Vercel cron or Supabase edge function) with Adzuna/Jooble adapters -> upsertSourcedJobs.

## 2026-08-29 - Session 1: scaffold + domain layer (TDD)

**Done**
- Scaffolded Next.js 15 + TypeScript strict + Vitest + zod; placeholder landing page.
- TDD red->green across the domain layer: **44 tests, 9 files, all passing; tsc clean.**
  - sector-graph (M1): findOrCreateNode / mergeJdExtract / topSkills / gapAnalysis
  - bullet-matcher + cv-diff (M3): lexical scoring, top-k selection, diff-from-master with the keyword honesty rule, applyDiff
  - pipeline (M5): transitions (closed terminal, reason required), appliedAt stamped once, stale >= 14 days, funnel stats + response rate
  - outreach (M4): follow-up cadence (hot 3d / warm 7d / cold 14d), due list, MessageContext builder (relevant projects, last interaction, first-touch flag, shared ground)
  - scoring (M7): 0-100 job score = sector company + title/skill overlap + network boost + geography
  - token-meter: ledger, totals by module, budget ok/warning(80%)/exceeded
  - adapters: LlmProvider interface + FakeLlm + routeModel (small vs premium); Adzuna result mapper with fixture test
- Database data model: supabase/schema.sql - single canonical file, full drop-and-recreate (per Wani: no incremental migrations until live data). 12 tables, enums, RLS on everything, closed-needs-reason check constraint.
- CLAUDE.md project memory written.

**Decisions**
- Data model = supabase/schema.sql, edited in place, re-run wholesale until live data. Then freeze + switch to migrations.
- Domain layer stays pure (no I/O) so it tests fast and survives any framework change.
- jd_raw kept in DB for audit but NEVER re-enters prompts; jd_extract is the working copy.

**Next (in order)**
1. Wani connects Supabase (run schema.sql, confirm it executes clean - it has not run against a real project yet) and Vercel.
2. Repository layer: thin typed Supabase client wrappers per table (test with a fake client).
3. API routes: POST /api/jd (extract via LlmProvider -> merge sector -> create application), POST /api/cv-diff, GET /api/brief.
4. Real LlmProvider impls: Gemini free tier first, Groq fallback, behind routeModel; wire token_ledger.
5. UI: pipeline board, contacts, projects (port the Cowork dashboard artifact's layout).
6. Sourcing cron (Vercel cron or Supabase edge function) with Adzuna/Jooble adapters.

**Open questions for Wani/Parag**
- Supabase project region (Singapore region makes sense).
- Auth: email magic-link only, or Google OAuth too?
- Where should CV exports live: Supabase storage bucket vs generated-on-demand?
