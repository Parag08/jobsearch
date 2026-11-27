# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state. Keep only the last two or three sessions here - move older entries to docs/MEMORY-archive.md so a fresh session stays cheap to start.

## 2026-11-27 - Demo workspace budget

Security finding fix: a public demo visitor's in-memory FakeDb now refuses writes past `DEMO_DB_LIMITS` in `lib/db/demo.ts` (500 rows per table, 200k characters per record, 2M characters per workspace; the seed is about 65k). The refusal comes back as a normal `{error}`. `GET /demo` allows 10 new visitor ids per client address per 10 minutes on each instance and answers 429 after that; an existing valid visitor cookie is never throttled.

## 2026-11-27 - Interviewer ratings keyed per user

Migration 0022 makes `interviewer_ratings` unique on (user_id, session_id, turn_index) and its "own rows" policy only accepts a row whose session belongs to the caller; it deletes existing rows that point at another user's session. `rateInterviewerLine` upserts on `user_id,session_id,turn_index`. Run `npm run db:migrate` to apply it to the live project.

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
