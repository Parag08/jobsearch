# Threat model — Parag08/jobsearch

_Sources: the code at `main` (813c52e), `CLAUDE.md`, `.env.example`, `supabase/schema.sql`, and the owner's answers (2026-11-09). Keep this file current when trust boundaries, entry points or the owner's risk decisions change; security scans start from it. No separate infrastructure repo: Vercel and Supabase are configured in their dashboards (owner), so the in-repo schema/RLS and `vercel.json` are the only infra-as-code._

## System overview
A personal job-search app: Next.js 15 App Router on Vercel (`sin1`), Supabase (Postgres + Auth + RLS, ap-southeast-1), LLM calls via Vercel AI Gateway or Gemini/Groq/Anthropic. Without `NEXT_PUBLIC_SUPABASE_URL` the app runs in **demo mode** (in-memory FakeDb loaded from `data/cvbuilder/`).

**Users (owner):** only Parag today; a few invited peers later. Sign-in is Google / LinkedIn OIDC through Supabase Auth — any OAuth account that completes sign-in gets a profile via the `handle_new_user` trigger, so "invite-only" is not enforced in code. **Owner: open sign-up is intended and fine** — a stranger becoming a tenant is not itself a finding; what matters is what one tenant can do to another.

## Trust boundaries
1. Internet → Vercel (pages, `/api/*`, server actions, `/auth/callback`).
2. Server → Supabase with the user's session cookie and the **publishable key**: RLS (`user_id = auth.uid()`) is the only tenant isolation. `lib/db/index.ts#getWorkspace` is the single entry; repos also pass `userId` but RLS is the guard.
3. Server → LLM providers: user/third-party text (JD postings, interview answers, case turns) goes into prompts; model output comes back into the app and DB.
4. Server → third-party job boards (`lib/watchlist/fetcher.ts`, fixed ATS endpoints built from a user-set board token; `scripts/source-singapore.ts`, Adzuna/Jooble).
5. Operator/CI → DB with `SUPABASE_DB_URL` / `SUPABASE_SECRET_KEY` (bypass RLS): `scripts/*.mjs|ts`, `.github/workflows/db.yml`, `keepalive.yml`.

## Components
| Name | Covers |
|---|---|
| **Web UI** | `app/page.tsx`, `app/_components/**`, `app/app/**/*.tsx`, `app/layout.tsx` (inline theme script) |
| **Server actions & API** | `app/app/actions.ts`, `app/api/{jd,cv-diff,brief}/route.ts`, `lib/services/**` |
| **Auth** | `app/signin/**`, `app/auth/callback/route.ts`, `lib/db/supabase.ts`, `lib/db/index.ts` |
| **Database & RLS** | `supabase/schema.sql`, `supabase/migrations/**`, `supabase/seed.sql`, `lib/repos/**` |
| **LLM integration** | `lib/adapters/**`, `lib/interview/**` (prompts, `guardReply`), `lib/services/process-jd.ts` |
| **Job sourcing** | `lib/watchlist/**`, `lib/companies/**`, `scripts/source-singapore.ts`, `scripts/sync-companies.ts`, `scripts/probe-boards.ts` |
| **Scripts & CI** | `scripts/db-*.mjs`, `scripts/import-cvbuilder.ts`, other `scripts/**`, `.github/workflows/**`, `vercel.json` |

## Entry points and who reaches them
- `/api/jd` (POST), `/api/cv-diff` (POST), `/api/brief` (GET): any signed-in user; 401 otherwise. `/api/jd` spends LLM tokens.
- Server actions in `app/app/actions.ts` (stage moves, watchlist add/refresh, JD intake, interview scoring, case interviewer turns): any signed-in user; take IDs from the client.
- `/auth/callback?code=&next=`: anonymous; `next` is used in a redirect.
- `/signin` server action builds the OAuth `redirectTo` from `Origin`/`Host` headers.
- Landing page and demo mode: anonymous.
- CI workflows: anyone who can push to `main` / trigger workflow_dispatch.

## Assets (by sensitivity)
1. **Server secrets**: `SUPABASE_SECRET_KEY` (RLS bypass), `SUPABASE_DB_URL` (DB password), `AI_GATEWAY_API_KEY` / provider keys (spend).
2. **Hand-typed, non-regenerable data**: `interview_answers`, `interview_attempts`, `case_sessions` (CLAUDE.md: cannot be regenerated).
3. **Personal data**: profile, CV corpus (`projects`, `bullets`, `master_cvs`, `application_cvs`), `applications`, `contacts`/`interactions` (third-party PII).
4. Shared `companies` directory (read-only to users; written only with the service key — deliberate anti-poisoning design).
5. LLM quota / AI Gateway credit. **Owner: capped / free tier, so token or quota abuse is low impact.**

## Attackers that matter (owner: all of them)
- **Anonymous internet users** — auth flow abuse, open redirect, anything reachable without a session, signing up as a new tenant.
- **Other signed-in users** (peers, or anyone who completes OAuth) — cross-tenant read/write via IDOR or RLS gaps, poisoning shared tables, burning the owner's LLM credit.
- **Malicious job postings / JD text and board payloads** — prompt injection into LLM calls, stored XSS via extracted fields or board data, oversized payloads.
- Supply chain / CI (implicit): workflows that hold `SUPABASE_DB_URL`.

## Existing controls
- RLS enabled on every table; `own rows` policy for all user tables; `companies` select-only for `authenticated`.
- Publishable key only in the browser/server request path; secret key only in scripts (per `.env.example`).
- `handle_new_user` is `security definer` with `set search_path = public`.
- LLM: code owns state/math in the case interviewer; `guardReply` blocks unstated figures; every call logged to `token_ledger`.
- Honesty rule in `buildDiff` (functional, not security).
- Migrations are additive; `db-apply` refuses `schema.sql` without `--force-drop`.

## Out of scope / accepted risk (owner)
- Nothing ruled out: scan everything, including scripts, CI and demo mode.
- Open sign-up (any Google/LinkedIn account becomes a tenant) is intended.
- LLM spend/quota exhaustion is low impact: keys are capped / free tier.

## Open questions
- None outstanding.
