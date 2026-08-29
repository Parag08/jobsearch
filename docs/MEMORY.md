# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state.

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
