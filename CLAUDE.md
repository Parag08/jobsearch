# JobPilot - Claude project memory

Read this first in every session. Update it whenever a decision or convention changes.
The running work log (what happened when, what's next) is docs/MEMORY.md - update it at the end of every working session.

## What this is
JobPilot: a personal job-search operating system, built first for Parag (target: AI/PM roles in **Singapore**), designed generic so peers can use it. Seven modules around one shared brain. Full product spec: docs/SPEC.md.

## Non-negotiable design rules
1. **TDD.** Red -> green -> refactor. No domain code without a failing test first. Tests live next to code: `lib/**/*.test.ts`, run with `npm test`.
2. **Token economy** (spec section 6). Parse once and store structured JSON; rules/lexical matching before LLM calls; prompts carry IDs + compact summaries, never documents; CV tailoring emits a diff from the master, not a regenerated CV; model routing via `lib/adapters/llm.ts` (small tier for extraction, premium only for polish/outreach); every LLM call logged to token_ledger.
3. **Honesty rule.** A CV never mirrors a JD keyword unless it is evidenced in the bullet bank (`buildDiff` enforces this - keep it that way).
4. **Generic multi-user.** Personal facts (INSEAD, Singapore) are DATA, never schema or code constants. Every table has user_id + RLS.
5. **Free-first.** $0 defaults (Gemini/Groq free tiers, Supabase free, Adzuna/Jooble free feeds); paid components opt-in and swappable behind adapters.

## Database data model
- **The canonical data model is `supabase/schema.sql`** - one file, edited in place.
- **Policy until live data exists:** full drop-and-recreate, no incremental migrations. Re-run the whole file after each change.
- **When live data arrives:** freeze schema.sql, switch to numbered files in supabase/migrations/. (Flip this section when that happens.)
- Not yet executed against a real Supabase project - validate on first run (Wani connects Supabase + Vercel).

## Architecture
- Next.js 15 App Router + TypeScript strict + Vitest + zod. Deploy target: Vercel. DB: Supabase (Postgres + auth + RLS).
- `lib/` is the pure domain layer - no I/O, no framework imports, fully unit-tested:
  - types.ts (zod schemas, STAGES, norm()) | sector-graph.ts (M1) | bullet-matcher.ts + cv-diff.ts (M3)
  - pipeline.ts (M5) | outreach.ts (M4) | scoring.ts (M7) | token-meter.ts
  - adapters/: llm.ts (LlmProvider interface + FakeLlm + routeModel), adzuna.ts (feed mapper)
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
