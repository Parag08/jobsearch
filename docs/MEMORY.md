# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state.

## 2026-09-04 - Session 5: re-sync after the Bain applications

**Done**
- Re-synced `data/cvbuilder/` from the CVbuilder project (Parag worked in it 09-03/09-04), rebuilt `supabase/seed.sql`, applied it. Live DB now: **23 bullets, 5 applications, 5 application CVs, 3 sectors** (was 20/3/3/2). 112 tests green, tsc clean.
- What actually changed in the corpus: **3 new points** (`nutanix-move-diligence` s5 - the Move technical due diligence, 400+ critical security risks to 20 and 500+ licence risks to zero; `valeo-cost-buyin` s4 - CEO/ops-leadership approval; `nutanix-vp-roadmap` s4 - the six-month roadmap presented with the VP), **2 new applications** (Bain TIG + Bain general consulting), a reordered Eleven01 title, and a rewritten consulting-archetype note. Everything else was line-ending noise.

**The editorial learnings the CV work produced** (they live in CVbuilder's `notes` fields, not in its CLAUDE.md, which has not changed since 08-29):
- **Standing instruction: Valeo and EverHaus are capped at two points each** - an internship and a part-time role must not outweigh the full-time ones. This forced `valeo-cost-buyin` to carry an `overrideText` merging the 30% recommendation with the CEO approval on both Bain CVs.
- **Naming a tool is a factual claim.** add-tech now leads with "Claude" (not generic "AI") because Cursor was confirmed to be running Claude on the Valeo work - deliberately aimed at McKinsey, which deploys Claude. The Nutanix/EverHaus AI bullets were left alone: not confirmed as Claude, so naming it there would be invention.
- **ATS pass-through:** "Generative AI Tools (Claude, Cursor)" was added to the Skills line as well as Technologies, so a keyword scan of Skills alone still hits.
- **A gap closed:** the Skills line can now honestly claim Technology Due Diligence - before `nutanix-move-diligence` it could not, and deliberately did not.
- **Open gap:** no French, so Bain **Montreal** may be a hard filter. Worth checking before applying there.
- `nutanix-vp-roadmap` is in the pool but deliberately off both Bain pages (collides with `nutanix-sales-acv`).

**Two import bugs this surfaced, both fixed**
- `savedAt` fell back to the wall clock for applications CVbuilder never re-saved (only microsoft-*.json today), so `seed.sql` differed on every rebuild and the committed-seed guard failed a day later. Now falls back to `UNDATED_FALLBACK_DATE`; `ImportOptions.today` is optional and the script no longer passes the clock.
- `seed:build` re-derived the workspace owner from `profile.json`, which lists the INSEAD address first - but the auth.users row is the gmail one. A plain rebuild silently retargeted the seed at a non-existent account (it aborted cleanly). The existing seed's owner now outranks the profile.

**Known-wrong, left as data**
- `bain-tig-consultant` imports as role family **product-strategy**; it is a consulting role. The importer only trusts a family when an archetype claims the posting as evidence, and no archetype does - so it guessed and warned. Fix at source: add both Bain JDs (and BCG/Microsoft) as `fromApplication` evidence in CVbuilder's `data/archetypes.json`, rebuild the base CV, re-sync. That also lets the consulting archetype learn from two real MBB JDs instead of leaning on its seed.

**Next**
1. Wire the API routes to a real Supabase client (unchanged, still the biggest gap).
2. Bain evidence fix above (asked Parag; not done unilaterally - it regenerates a curated base CV).
3. When CV tailoring gets built here, `selectBullets` needs the per-org cap the CVbuilder work relies on; it currently has no notion of one.

## 2026-09-02 - Session 3: CVbuilder data import

**Done**
- Brought the real CV corpus into the repo: `data/cvbuilder/` (profile, points, taxonomy, archetypes + 10 application files), copied from the CVbuilder project. `data/settings.local.json` was deliberately NOT copied - it holds a live Google API key, and this repo is public on GitHub.
- Import layer, red->green: **112 tests, 25 files, all passing; tsc clean.**
  - `lib/import/cvbuilder.ts` - pure transform, zod-validated. CV role -> project; point -> bullet (variants + strength carried); archetype -> master CV per role family from its base-CV selection; master.json/generic.json -> the "general" family (v1/v2); real applications -> application + application_cv (the CV actually sent, as a diff from its master); JDs -> sector nodes per (role family, geography).
  - JD extracts are built lexically from `taxonomy.json` (the user's own vocabulary), no LLM - process-jd overwrites them when a real extractor runs.
  - `lib/import/seed-sql.ts` - renders the workspace as one transactional DO block that resolves the owner from auth.users by email and upserts every row.
  - `lib/import/real-data.test.ts` - integrity checks against the actual data, plus a guard that fails if `data/cvbuilder/` changed without rebuilding `supabase/seed.sql`.
- `scripts/import-cvbuilder.ts` (`npm run seed:build`, via vite-node) and `npm run db:seed`; `scripts/db-apply.mjs` now takes a file argument and also reads `.env`.

**Decisions**
- Ids are deterministic hashes of CVbuilder slugs (`stableId`), so re-importing updates rows instead of duplicating them, and master CVs can reference bullets before either exists in the DB.
- Schema additions (drop-and-recreate policy still in force): `profiles.contact_lines`, `profiles.cv_extras`, `bullets.variants`, `bullets.strength`. `CvDiff` gained optional `variants`/`overrides` so a per-application re-angling survives the round trip. `Bullet.variants/strength` are optional in the domain type - app-built bullets carry neither and the DB columns default.
- A bullet's `role_family` comes only from explicit editorial signal (an archetype that pins it, re-angles it, or is the sole base CV carrying it); everything else is "general". Role family is only a scoring boost, so neutral bullets are still matched everywhere.
- Imported applications land in `saved`, never `applied`: CVbuilder never recorded whether they were submitted, and the import will not invent it. Each carries a next_action saying so.
- A posting no archetype claims gets its family guessed from taxonomy overlap AND a warning (currently: the Microsoft PDM role).

**Supabase: LIVE**
- Project `nntoalvvozwrlcilbnop` (ap-southeast-1). `npm run db:apply` then `npm run db:seed` both ran clean - schema.sql's first real execution, and the DB now holds the imported workspace. Verified: 1 profile, 2 sectors, 10 projects, 20 bullets, 7 master CVs, 3 applications + 3 application CVs, no dangling bullet references. Seeding twice leaves the counts unchanged (the upserts are genuinely idempotent).
- **Connect over the session pooler**: `postgres.<ref>@aws-0-ap-southeast-1.pooler.supabase.com:5432`. The direct `db.<ref>.supabase.co` host is IPv6-only and fails with ENOTFOUND here. Port 6543 (transaction mode) cannot run DDL - use 5432.
- `.env` (gitignored) holds SUPABASE_URL / PUBLISHABLE_KEY / SECRET_KEY / JWKS_URL / DB_URL. Note the app-facing names lack the `NEXT_PUBLIC_` prefix that .env.example specifies - reconcile when the Supabase client is wired.
- The owner auth.users row (parag.m.rahangdale@gmail.com) was created by hand in the dashboard. Seeding a different owner: `SEED_EMAIL=... npm run seed:build`.

**Next**
1. Wire the API routes to a real Supabase client (now the biggest gap): add @supabase/supabase-js, `createDb()` returning it as DbClient, user_id from the session, replace the 503 shells.
2. Feed the Microsoft JD into archetypes.json as evidence so its role family stops being a guess.
3. UI: pipeline board over the 3 live applications, then the bullet bank.

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

**Push: resolved**
- This machine now authenticates to GitHub over SSH as Parag08 (ed25519 key at ~/.ssh/id_ed25519, added to the Parag08 account; origin switched to git@github.com:Parag08/jobsearch.git). main is pushed and tracking origin/main.

**Next (in order)**
1. Wani: connect Supabase (run schema.sql, confirm clean) and Vercel.
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
