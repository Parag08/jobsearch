# Threat model — Parag08/jobsearch

_Sources: the owner's answers (2026-11-09) plus the code at `main` (3270970, 2026-11-26: fail-closed Supabase, Next 15.5.29, Zod 4). Facts marked **(owner)** come from Parag; everything else is read from the code. Keep this file current when trust boundaries, entry points or the owner's risk decisions change; security scans start from it. No infrastructure repo: Vercel and Supabase are configured in their dashboards; `vercel.json` and `supabase/` are the only infra-as-code._

## System overview and trust boundaries
Next.js 15 App Router on Vercel (`sin1`) + Supabase (Postgres, Auth, RLS, Storage; ap-southeast-1). LLM calls via Vercel AI Gateway or Gemini/Groq/Anthropic (`lib/adapters/llm-factory.ts`), optional ElevenLabs TTS. Missing Supabase URL or publishable key **fails closed** (`lib/db/supabase.ts#requireWorkspaceEnv` throws; middleware too); only `NODE_ENV=development` with `LOCAL_DEMO_MODE=true` uses the shared in-memory FakeDb of `data/cvbuilder/` (a production deploy that reaches the FakeDb would expose Parag's real CV). With `DEMO_MAX_VISITORS` set, `/demo` gives each anonymous visitor a private FakeDb of a fictional person (`lib/demo/**`).

1. Internet → Vercel: pages, server actions, `/api/*`, `/auth/callback`, `/demo`.
2. Request path → Supabase with the user's cookie + publishable key: **RLS (`user_id = auth.uid()`) is the tenant guard** (`lib/db/index.ts#getWorkspace`).
3. MCP path → Supabase with `SUPABASE_SECRET_KEY`: **RLS bypassed**; isolation = token-resolved `userId` + a `user_id` filter in every repo call (`lib/db/agent.ts#getAgentWorkspace`).
4. Server → LLM / TTS providers: third-party text (JDs, transcripts) into prompts; model output back into UI and DB.
5. Server → ATS job boards (Greenhouse/Lever/Ashby/SmartRecruiters; fixed hosts in `lib/watchlist/posting.ts#postingEndpoint`, user token URL-encoded).
6. Operator/CI → DB with `SUPABASE_DB_URL` / secret key: `scripts/**`, `.github/workflows/{db,keepalive,sourcing,ci}.yml`.

## Components
| Name | Covers |
|---|---|
| **Web UI** | `app/page.tsx`, `app/_components/**`, `app/app/**/*.tsx`, `app/layout.tsx` |
| **Server actions & API** | `app/app/**/actions.ts`, `app/app/interview/full-actions.ts`, `app/api/{jd,cv-diff,brief,export,interview-eval,tts}/**`, `lib/services/**` (except agent-*) |
| **Auth** | `app/signin/**` (Google/LinkedIn OIDC, Google One Tap nonce in `lib/auth/google-one-tap.ts`), `app/auth/callback/route.ts`, `middleware.ts`, `lib/auth/**`, `lib/db/supabase.ts`, `lib/db/index.ts` |
| **MCP agent API** | `app/api/mcp/route.ts`, `lib/mcp/**`, `lib/db/agent.ts`, `lib/agent/**`, `lib/services/agent-*.ts`, `lib/repos/api-tokens.ts`, `app/app/agent/**` |
| **Database & RLS** | `supabase/schema.sql`, `supabase/migrations/**`, `supabase/seed.sql`, `lib/repos/**` |
| **LLM integration** | `lib/adapters/**`, `lib/interview/**`, `lib/services/ai-write.ts`, `lib/services/process-jd.ts` |
| **Demo mode** | `app/demo/**`, `lib/demo/**`, `lib/db/demo.ts`, `data/demo/**` |
| **Job sourcing** | `lib/watchlist/**`, `lib/companies/**`, `scripts/source-singapore.ts`, `scripts/sync-companies.ts`, `scripts/probe-boards.ts` |
| **Scripts & CI** | other `scripts/**`, `.github/workflows/**`, `vercel.json` |

## Entry points and who reaches them
- Anonymous: landing, `/signin` (OAuth `redirectTo` built from `Origin`/`Host`), `/auth/callback?code=&next=`, `/demo` (when enabled).
- Any signed-in user: server actions (take record IDs from the client), `/api/jd` (spends LLM), `/api/cv-diff`, `/api/brief`, `/api/export/[applicationId]` (writes to private `cv-exports` bucket, path `<uid>/…`), `/api/interview-eval`, `/api/tts` (spends ElevenLabs).
- Agent-token holders: `POST /api/mcp` (added 2026-11-13) — anyone holding a personal agent token (`Authorization: Bearer jsk_…`, made on `/app/agent`). 401 otherwise. **Runs with `SUPABASE_SECRET_KEY`, so RLS is bypassed**: isolation is the userId resolved from the token hash (`lib/db/agent.ts`) plus the `user_id` filter in every repo the tools call (`lib/mcp/tools.ts` → `lib/services/agent-sync.ts`). A tool that queried without a userId would be a cross-tenant hole. Tokens are stored as SHA-256 hashes, shown once, revocable, and expire (30/90/365 days, default 90; migration 0014). A token is `write` (all tools) or `read` (only tools annotated `readOnlyHint`; others are hidden and refused). `api_tokens` has own-rows RLS for the owner's UI. **LLM calls on this path:** `upsert_application` with `jdRaw` reads the posting through `readRole` (one small-tier call, logged to `token_ledger`), at most 3 per request (`capReads`); later ones save the posting unread. Limits: 60 requests/minute per token (429 + `Retry-After`), body 512 KB (bytes), batch 20, `jdRaw` 60,000 chars. Every tool carries MCP annotations (`readOnlyHint`/`destructiveHint`); `set_stage` to `closed` and `set_model_answer` with `force` refuse without `confirmedByUser: true`. Tool results return third-party text (postings, transcripts, contact notes); the server instructions tell the agent it is data, never instructions.
- Push/workflow_dispatch on `main`: CI with `SUPABASE_DB_URL`.

## Assets
1. Server secrets: `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL`, `AI_GATEWAY_API_KEY`/provider keys, `ELEVENLABS_*`.
2. Hand-typed, non-regenerable data: `interview_answers`, `interview_attempts`, `case_sessions`, `interview_full_sessions`, model answers **(owner: cannot be regenerated)**.
3. Personal data: profile, CV corpus, applications, exported CVs, `contacts`/`interactions` (third-party PII), agent tokens.
4. Shared `companies` directory (select-only for users).
5. LLM/TTS quota **(owner: capped / free tier — low impact)**.

## Attackers that matter **(owner: all of them)**
- **Anonymous internet users** — auth-flow abuse, open redirect, demo-mode abuse.
- **Other signed-in tenants** — **(owner: open sign-up via Google/LinkedIn is intended)**, so any internet user can become one; the core risk is cross-tenant read/write (IDOR, RLS gaps, MCP filter gaps) and poisoning shared tables.
- **Malicious postings / board payloads / LLM output** — prompt injection, stored XSS, oversized payloads.
- **Supply chain / CI** — workflows holding `SUPABASE_DB_URL`.

## Existing controls
- RLS enabled with `own rows` policies on user tables; `companies` read-only to `authenticated`; storage policies scope `cv-exports` to `foldername[1] = auth.uid()` (migration 0006).
- Agent tokens: SHA-256 hash only, shown once, revocable, expiring, scoped, rate-limited (migration 0014); `confirmedByUser` for destructive MCP actions.
- Demo: `cannedAi` routes every model call through `lib/services/ai-write.ts` to `lib/demo/canned.ts`; demo corpus is fictional (`data/demo/`), never `data/cvbuilder/`.
- Prompts frame third-party text as data; `guardReply`/`guardFullReply`/`guardRewrite` constrain model output.
- `handle_new_user` is `security definer` with fixed `search_path`; migrations additive; `db-apply` refuses `schema.sql` without `--force-drop`.

## Security Invariants
- **Tenant isolation / IDOR (CWE-639, CWE-862).** Request-path code gets its DB only from `getWorkspace()` and relies on RLS; every new table ships `enable row level security` + an `own rows` policy in its migration (mirror in `schema.sql`). On the MCP path (`getAgentWorkspace`, secret key) every query reached from `lib/mcp/tools.ts` must carry `.eq("user_id", userId)` with the token's userId — never an id or user from tool arguments. Anti-pattern: a repo function that looks up a row by id alone and is called from an MCP tool. Server actions that take ids rely on RLS — a gap appears only if an action uses the secret key.
- **Authentication (CWE-287, CWE-613).** Supabase SSR cookies refreshed in `middleware.ts`; agent tokens resolved by hash in `resolveApiToken` with expiry and scope checked server-side; `read` tokens must be refused non-`readOnlyHint` tools, not just hidden.
- **Open redirect (CWE-601).** `/auth/callback` redirects to `new URL(next, url.origin)`; `next` must stay a same-origin path (an absolute or `//host` value escapes origin). `/signin` `redirectTo` comes from request headers and must match Supabase's allow-listed redirect URLs. **Gap to check:** `next` is not validated in code today.
- **XSS (CWE-79).** React escapes by default; the only `dangerouslySetInnerHTML` uses are constant boot scripts in `app/layout.tsx`. Posting, board, transcript and LLM text must render as text, never via `dangerouslySetInnerHTML`, `href` from untrusted URLs (`javascript:`), or generated HTML/markdown without sanitising.
- **Prompt injection / LLM output (CWE-1427).** Third-party text is framed as data; code owns state, math and legal moves (`full-session.ts`, `case-session.ts`); model output never chooses DB targets, user ids or tool calls.
- **SSRF / egress (CWE-918).** Outbound calls go to fixed hosts (`postingEndpoint`, ElevenLabs, LLM providers) with user parts `encodeURIComponent`-ed; never fetch a user-supplied URL (e.g. a pasted LinkedIn link) server-side.
- **Injection (CWE-89).** All DB access via supabase-js query builder / parameterised `pg` in scripts; no string-built SQL from user input.
- **File storage / path (CWE-22).** Export paths are `<userId>/…` built server-side; downloads by signed URL for the caller's own path only.
- **Secrets (CWE-798, CWE-200).** Secret key only in `lib/db/agent.ts` and `scripts/**`; never `NEXT_PUBLIC_*`, never in client bundles or logs; per-user settings (`lib/settings/registry.ts`) never include secrets.
- **Fail closed (CWE-1188).** Workspace resolution and middleware throw when Supabase env is missing; the local FakeDb (real `data/cvbuilder/` data, shared, no auth) is reachable only when `NODE_ENV === "development"` and `LOCAL_DEMO_MODE=true`. Any other path to `getDemoDb()` is a gap.
- **Demo isolation.** A `jobsearch_demo` cookie must never yield a live workspace, real data or a provider call; `cannedAi` must short-circuit every AI and TTS path.
- **CI / supply chain (CWE-829).** Workflows with `SUPABASE_DB_URL` run only on `main`/dispatch, never on `pull_request_target` with untrusted code.
- **Resource abuse (CWE-770).** Body/batch/read caps on MCP; owner rates LLM spend as low impact.

## Out of scope / accepted risk **(owner)**
- Nothing ruled out: scan everything, including scripts, CI and demo mode.
- Open sign-up is intended — a stranger becoming a tenant is not itself a finding.
- LLM/quota exhaustion is low impact (capped / free tier).

## Open questions
- None outstanding from the owner.
