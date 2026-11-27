# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state. Keep only the last two or three sessions here - move older entries to docs/MEMORY-archive.md so a fresh session stays cheap to start.

## 2026-11-27 - Per-user AI call limit

Code scan finding (signed-in users could make unlimited AI calls on the shared key). `aiWrite`, `aiLlm` and the MCP posting reader now take one call from a per-user sliding window before reaching a provider (`AI_CALL_LIMIT`, default 100, per `AI_CALL_WINDOW_SECONDS`, default 3600; deployment env only). The count lives in `ai_calls`, written only by `take_ai_call` (migration 0025, security definer, never resets inside the window). The quick mock interview session is stored in `interview_mock_sessions` and deleted once scored; `mockTurnAction`/`mockFeedbackAction` take `sessionId`. Run `npm run db:migrate` for 0025.

## 2026-11-27 - Agent token columns are server-managed

Migration 0024 replaces the `own rows` policy on `api_tokens`: owners may select, delete and set `revoked_at` (not clear it). Tokens are made only through `create_api_token(p_user_id, p_name, p_token_hash, p_scope, p_days)`, which accepts 30/90/365 days and sets expiry and the rate-limit window itself; `insertApiToken` calls it. A signed-in user can no longer PATCH `window_count`, `expires_at` or `scope` over REST. Check on a disposable Supabase database with `psql -f supabase/tests/api_tokens.sql`; run `npm run db:migrate` on the live project after merge.

## 2026-11-27 - Demo workspace budget

Security finding fix: a public demo visitor's in-memory FakeDb now refuses writes past `DEMO_DB_LIMITS` in `lib/db/demo.ts` (500 rows per table, 200k characters per record, 2M characters per workspace; the seed is about 65k). The refusal comes back as a normal `{error}`. `GET /demo` allows 10 new visitor ids per client address per 10 minutes on each instance and answers 429 after that; an existing valid visitor cookie is never throttled.

## 2026-11-27 - Posting length cap before the model

Security finding (cost amplification): job-posting text reached the paid LLM with only a 40-character minimum. `extractRole` (lib/services/read-role.ts) now refuses text over `MAX_POSTING_CHARS` (30,000) with `PostingTooLongError` before any model call, so every path (`/api/jd`, `createFromJd`, `readPostingAction`, save-to-pipeline, MCP upserts, Role insights reads) is covered. `/api/jd` answers 413; the server actions return the error's message, and an over-long paste is not stored. Role insights batches skip postings over the cap so they never take a slot. A per-user daily quota against the token ledger is not done yet.

## 2026-11-27 - Interviewer ratings keyed per user

Migration 0022 makes `interviewer_ratings` unique on (user_id, session_id, turn_index) and its "own rows" policy only accepts a row whose session belongs to the caller; it deletes existing rows that point at another user's session. `rateInterviewerLine` upserts on `user_id,session_id,turn_index`. Run `npm run db:migrate` to apply it to the live project.

## 2026-11-27 - Settings checked on read

Saved settings are now checked every time they are read, not only on save. A user can write their own `user_settings` row through PostgREST and skip the form. `settingsEnv` drops any stored value that breaks its registry bounds or choices, any group the app's own `*FromEnv` readers reject, and any model outside `allowedModels`. A dropped value falls back to the deployment's. The model allow-list is `AI_GATEWAY_ALLOWED_MODELS` when set, else the preference lists; the deployment's own models and the built-in defaults are always allowed. The Settings page offers only allowed models. Migration 0023 adds a `NOT VALID` check limiting `values` to at most 64 env-style keys with string values of at most 200 characters (mirrored in schema.sql). Run `npm run db:migrate` to apply it.

## 2026-11-26 - Workspace content polish

Today is the first workspace tab after JobSearch (Overview) and before Pipeline. Overview remains the default workspace landing page.

PR #51 QA covers clicking Today and returning to Overview on desktop, and tapping Today and checking the current page in the phone menu. Live Google OAuth remains outside the credential-free browser suite.

Pipeline Role insights now shows when its tab is opening, explains which roles are excluded and how to get a posting read, and shows an empty state when no read roles match a filter. Opening the tab makes no model calls; one projected query finds unread postings. Safe kits still store neither posting text nor extracts.

PR #52 QA covers the PostgREST query shape and the demo path from a safe kit excluded from Role insights to a separately pasted posting counted after reload. This does not exercise live sign-in or Supabase data.

Companies, Today, kits and the audited workspace pages now lead with records and actions. Today keeps the existing /app/watchlist route. Company removal explains its scope before confirmation and still offers Undo. Kits still require exact-content review and actual-submission confirmation. Home's hero shows only the recommended task and its link, without unrelated interview context.

Home's roles recommendation uses the same Ranked list as Today, including picked roles retained outside the ranking limit, rather than counting every new or shortlisted posting.

QA follow-up: the Assistant demo sign-in link is in the first setup step, Weekly goals points to “This week” on the Overview streak cards, and company research and classic application stage controls start their accessible names with the visible text.

The public demo lost newly prepared kits when a request reached another instance. With the same existing server signing secret configured on every instance, the visitor carries a bounded, signed cookie for sample-role triage, verified claims, and kits (including review and submission). The two-hour lease renews on workspace navigations at most every 15 minutes, not on Server Actions, prefetches, or internal action redirects. Other demo edits remain process-local; local FakeDb development mode and live Supabase are unchanged. A two-FakeDb regression and a local two-process browser check cover direct kit revisits.

Newer journals merge kits by application ID and patch only journal-owned fields. Missing entries do not delete warm data. This also restores kits prepared elsewhere when the receiving worker is already warm for that visitor. Removing a target journals the cleared picks, so Undo on another instance does not restore them. The journal cookie persists across browser restarts and expires and renews alongside the visitor cookie.

The signed Playwright workspace subset passed on both baselines (origin/main and `524ee6c`, 17 each), but failed with asynchronous Node-side HMACs (8 failed). Request traces showed no journal replays and the same FakeDb for mutations and renders, including stale UI on responses that wrote no cookies. Switching Node-side lease and journal HMACs to synchronous crypto resolved the reproduced failures (17 passed); middleware retains Edge-compatible Web Crypto and the same lease format.

PR #50 QA adds coverage for the Today bookmark, workspace headings and action labels, signed kit revisits across two browser-test server processes, visitor isolation, and journal size and unsigned-demo limits. See `docs/E2E.md` for ports and scope.

## 2026-11-26 - Daily sourcing and company list import

Companies → Import list reviews one CSV or visible XLSX worksheet in a browser worker. Only confirmed, mapped organization fields reach the server; migration 0021 applies target changes as one transaction and keeps a minimal receipt for retry and Undo. Undo removes unchanged memberships and unprepared picks, not company records, research, Network or applications. Run `LOCAL_DEMO_MODE=true npm run dev` without Supabase to try the flow with the included templates.

Import review follow-up: CSV delimiter selection favors consistent multi-column samples. Migration 0021 uses root Unicode lowercasing for new import identities without changing the legacy sourcing normalization. Run `psql -f supabase/tests/company_import.sql` on a disposable Supabase database with the schema applied to check the Unicode import RPC.

The Companies page's Last import banner can be dismissed in this browser. The receipt ID scopes the local preference, so the next import still shows its banner. After dismissal, Undo import and View result are below the target list.

PR #48 QA checks that the full result is unaffected by dismissal and that blocked browser storage allows dismissal for the current page without saving it across reload. On reload, the list renders before the receipt preference is read, without flashing the banner; open tabs sync dismissal through the browser storage event.

PR #46 QA adds browser coverage for a stale import across two tabs and scoped Undo, plus unit coverage for ambiguous mapping, ignored formula columns, and payload shape validation.

Today ranks active target-company postings, with saved triage and an editable daily maximum. Companies owns public research and links to private Network. Picked roles can become Saved safe kits; optional drafts/research wait for the user's Claude, and only explicit confirmation records Applied. Apply additive migration 0020 before live use. The pilot stores structured evidence/answer categories and official citations, not arbitrary prose or full posting snapshots.

Board replacements keep saved applications, reject checks from the previous configuration, and hide postings from the disconnected board. Confirming submission with different materials does not preserve withdrawn evidence in the kit.

PR #45 QA adds demo-browser coverage for reversible Pick and Later, answer-request persistence, and confirming different materials, plus unit coverage for ranking exclusions and submission guards. See `docs/E2E.md` for the browser screen map and live-service limits.

## 2026-11-26 - Threat model refresh

Rewrote `SECURITY_MODEL.md` from the threat model behind the 2026-11-26 security scan: same owner answers, now with nine named components (adds MCP agent API and Demo mode), the fail-closed Supabase rule, and a Security Invariants section per vulnerability class. Open findings from that scan: no posting-length cap on `/api/jd` / `createFromJd`, and `interviewer_ratings` unique key missing `user_id`.

## 2026-11-25 - Fail closed without Supabase

Middleware and workspace resolution refuse requests without the Supabase URL and publishable key. To use the shared CVbuilder workspace locally without credentials, opt in with `LOCAL_DEMO_MODE=true npm run dev`. A production build can be made without credentials, but production requests cannot use the local demo. The fictional public demo still uses `DEMO_MAX_VISITORS` on configured deployments.
