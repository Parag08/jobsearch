# JobSearch

A personal job-search operating system - seven modules around one shared brain:

1. **Sector Intelligence** - a self-updating sector graph (e.g. IT > AI > Singapore), enriched by every JD you paste
2. **Project Repository** - your experience captured once, pre-processed into reusable achievement bullets
3. **CV Builder** - a hand-refined master CV per role family; each application CV is a reviewed *diff* from the master
4. **Outreach CRM** - contacts, full interaction history, targeted message drafting
5. **Application Tracker** - JD-in, pipeline-out, every record linked to the exact CV sent
6. **Daily Brief** - morning industry download ranked by relevance to your active applications
7. **Sourcing Engine** - jobs + people scored by sector fit, skill overlap and network proximity

Free-first (Gemini/Groq free tiers, Supabase free, free job feeds), token-lean by design, multi-user from day one.

## Stack
Next.js 15 (App Router, TypeScript strict) · Supabase (Postgres + auth + RLS) · Vitest · zod · Vercel

## Getting started
```bash
npm install
npm test        # domain layer test suite
npm run dev     # http://localhost:3000
```
Copy `.env.example` to `.env.local` and fill in keys (Supabase, LLM providers, job feeds).

## What exists today
The UI is no longer a shell - signed-in surfaces are live under `/app`:

| Route | Surface |
|---|---|
| `/signin` | Supabase auth entry point (Google One Tap + email) |
| `/app` | Dashboard |
| `/app/applications/[id]` | Single application record - JD, CV sent, pipeline state |
| `/app/bank` | Story/answer bank |
| `/app/interview` | Case and interview drills |
| `/app/watchlist` | Watched companies and ATS checks |

Auth is Supabase SSR throughout; routing rules live in `lib/auth/`.

## Database
The canonical data model is **`supabase/schema.sql`** - a single drop-and-recreate file while the project has no live data. Run it in the Supabase SQL editor to (re)build the schema. See CLAUDE.md for the migration policy.

## CV data
`data/cvbuilder/` holds the CV corpus - profile, the bullet pool with its re-angled variants, the tagging taxonomy, the role-family archetypes and every application built from them. It is the source of truth; edit it there and rebuild:

```bash
npm run seed:build   # data/cvbuilder -> supabase/seed.sql (upserts, safe to re-run)
npm run db:apply     # schema.sql
npm run db:seed      # seed.sql   (the owner must have signed in once)
```
Both db commands need `SUPABASE_DB_URL` in `.env.local` or `.env`; `SEED_EMAIL=you@example.com npm run seed:build` seeds a different owner.

## Scripts

| Script | Purpose |
|---|---|
| `dev` / `build` / `start` | Next.js dev server, production build, serve |
| `test` / `test:watch` / `typecheck` | Vitest suite, watch mode, `tsc --noEmit` |
| `db:apply` / `db:migrate` / `db:seed` | Apply schema, run migrations, load seed data |
| `seed:build` | Regenerate `supabase/seed.sql` from `data/cvbuilder/` |
| `data:sync` | Sync corpus data into the database |
| `watchlist:refresh` | Refresh watched companies via ATS adapters |
| `case:drill` | Run a case-interview drill from the CLI |
| `ai:stream` | Exercise the LLM streaming path |
| `companies:sync` / `boards:probe` / `source:sg` | Company graph sync, job-board probing, Singapore sourcing |

## Repo guide
- `lib/` - pure, fully-tested domain layer (start here)
- `lib/import/` - CVbuilder -> JobSearch transform and the seed-SQL generator
- `lib/adapters/` - provider boundaries: LLM routing (small vs premium tier), job-feed mappers, ATS
- `lib/auth/` - Supabase SSR wiring, Google One Tap, route protection
- `lib/export/` - CV export (`docx`), file naming and storage
- `lib/interview/` - case method, session state, interview agent
- `lib/cover-letter/`, `lib/editorial/` - cover-letter generation, editorial audits and auto-select
- `lib/stories/`, `lib/repos/`, `lib/watchlist/`, `lib/onboarding/`, `lib/db/`, `lib/services/`, `lib/companies/` - the rest of the domain layer, one concern per folder
- `app/` - Next.js App Router surfaces (see the route table above)
- `docs/SPEC.md` - full product spec · `docs/DESIGN.md`, `docs/ROADMAP.md`, `docs/ONBOARDING.md`, `docs/UI-REVIEW.md` · `docs/MEMORY.md` - work log (older: `docs/MEMORY-archive.md`) · `CLAUDE.md` - project memory & rules

## CI
GitHub Actions in `.github/workflows/`: `ci.yml` (typecheck + tests), `db.yml` (schema/seed checks), `keepalive.yml` (Supabase free-tier keepalive), `sourcing.yml` (scheduled sourcing).

## Development discipline
TDD (red -> green -> refactor), typecheck clean, and the token-economy rules in CLAUDE.md apply to every feature.
