# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state. Keep only the last two or three sessions here - move older entries to docs/MEMORY-archive.md so a fresh session stays cheap to start.

## 2026-11-26 - Workspace content polish

Companies, Today, kits and the audited workspace pages now lead with records and actions. Today keeps the existing /app/watchlist route. Company removal explains its scope before confirmation and still offers Undo. Kits still require exact-content review and actual-submission confirmation.

Reproduced the public demo kit revisit failure with two production-mode processes: the same browser could open its kit on the writer, but saw “That page does not exist” on the other process. The visitor cookie identifies a process-local FakeDb; demo workspace persistence across instances is still needed.

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
