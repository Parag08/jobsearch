# JobPilot - Claude project memory

Read this first in every session. Update it whenever a decision or convention changes.
The running work log (what happened when, what's next) is docs/MEMORY.md - update it at the end of every working session.

## What this is
JobPilot: a personal job-search operating system, built first for Parag (target: AI/PM roles in **Singapore**), designed generic so peers can use it. Seven modules around one shared brain. Full product spec: docs/SPEC.md.

## Non-negotiable design rules
1. **TDD.** Red -> green -> refactor. No domain code without a failing test first. Tests live next to code: `lib/**/*.test.ts`, run with `npm test`.
2. **Token economy** (spec section 6). Parse once and store structured JSON; rules/lexical matching before LLM calls; prompts carry IDs + compact summaries, never documents; CV tailoring emits a diff from the master, not a regenerated CV; model routing via `lib/adapters/llm.ts` (small tier for extraction, premium only for polish/outreach); every LLM call logged to token_ledger.
3. **Honesty rule.** A CV never mirrors a JD keyword unless it is evidenced in the bullet bank (`buildDiff` enforces this - keep it that way). Naming a specific tool, firm or method is itself a claim: it needs a bullet behind it, not a plausible inference (the CVbuilder notes in `data/cvbuilder/` are full of worked examples).
   Two selection rules the CV work relies on that this codebase does NOT yet implement - honour them when tailoring lands: **cap points per org** (Parag's standing instruction: Valeo and EverHaus get at most two each, so an internship and a part-time role never outweigh the full-time ones), and **prefer a short variant over cutting a bullet** when a page runs long.
4. **Generic multi-user.** Personal facts (INSEAD, Singapore) are DATA, never schema or code constants. Every table has user_id + RLS.
5. **Free-first.** $0 defaults (Gemini/Groq free tiers, Supabase free, Adzuna/Jooble free feeds); paid components opt-in and swappable behind adapters.

## Database data model
- **The canonical data model is `supabase/schema.sql`** - one file, edited in place.
- **Policy until live data exists:** full drop-and-recreate, no incremental migrations. Re-run the whole file after each change.
- **When live data arrives:** freeze schema.sql, switch to numbered files in supabase/migrations/. (Flip this section when that happens.)
- **`supabase/seed.sql` is GENERATED** from `data/cvbuilder/` - never hand-edit it. Change the data, run `npm run seed:build`, commit both. (A test fails if they drift.) Apply with `npm run db:seed` after `npm run db:apply`; it upserts, so re-running is safe.
- **Live as of 2026-09-02**: schema.sql applied clean to project `nntoalvvozwrlcilbnop` (Singapore) and seed.sql loaded - the DB now holds real data (1 profile, 10 projects, 20 bullets, 7 master CVs, 2 sectors, 3 applications + CVs). Connect over the **session pooler** (`aws-0-ap-southeast-1.pooler.supabase.com:5432`, user `postgres.<ref>`); the direct `db.<ref>.supabase.co` host is IPv6-only and does not resolve.
- Live data now exists, but it is all regenerable from `data/cvbuilder/` - so drop-and-recreate stays valid for now. Freeze schema.sql and switch to migrations as soon as anything is entered through the app (applications advanced, contacts, interactions).

## Architecture
- Next.js 15 App Router + TypeScript strict + Vitest + zod. Deploy target: Vercel. DB: Supabase (Postgres + auth + RLS).
- `lib/` is the pure domain layer - no I/O, no framework imports, fully unit-tested:
  - types.ts (zod schemas, STAGES, norm()) | sector-graph.ts (M1) | bullet-matcher.ts + cv-diff.ts (M3)
  - pipeline.ts (M5) | outreach.ts (M4) | scoring.ts (M7) | token-meter.ts
  - adapters/: llm.ts (LlmProvider interface + FakeLlm + routeModel), adzuna.ts (feed mapper)
  - import/: cvbuilder.ts (data/cvbuilder -> workspace) + seed-sql.ts (workspace -> supabase/seed.sql)
- `data/cvbuilder/` is the CV corpus itself - the hand-refined source of truth for profile, points (bullets + variants), taxonomy, archetypes and past applications. Edit it there, then `npm run seed:build`. It is DATA: no code may hardcode anything in it (rule 4).
- `app/` is the Next.js shell - currently a placeholder page; UI comes after Supabase wiring.
- Data flow contract: JD raw text -> LlmProvider.extractJd -> JdExtract (stored) -> everything downstream reads the extract only.

## Conventions
- Domain functions pure; prefer immutable returns (pipeline.advance) - sector-graph mutates its node deliberately (documented).
- Dates as ISO strings (YYYY-MM-DD) in the domain layer; timestamptz only at the DB edge.
- Commit style: conventional-ish prefixes (chore/feat/test/docs), imperative subject.
- All matching/normalization goes through `norm()` in types.ts.

## Current status + next steps
See docs/MEMORY.md (keep it current - that file is the handoff).

## Related, outside this repo
- The Cowork pilot (folder-based JobPilot the user runs in chat) lives in the user's parag/jobpilot folder with a dashboard artifact; this repo is its productization. Keep concepts aligned (same stage names, same JdExtract fields) so pilot data can migrate.
