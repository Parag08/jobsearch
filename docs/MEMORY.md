# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state. Keep only the last two or three sessions here - move older entries to docs/MEMORY-archive.md so a fresh session stays cheap to start.

## 2026-11-26 - Daily sourcing

Today ranks active target-company postings, with saved triage and an editable daily maximum. Companies owns public research and links to private Network. Picked roles can become Saved safe kits; optional drafts/research wait for the user's Claude, and only explicit confirmation records Applied. Apply additive migration 0020 before live use. CSV/XLSX import design is pending; the pilot stores structured evidence/answer categories and official citations, not arbitrary prose or full posting snapshots.

Board replacements keep saved applications, reject checks from the previous configuration, and hide postings from the disconnected board. Confirming submission with different materials does not preserve withdrawn evidence in the kit.

## 2026-11-26 - Threat model refresh

Rewrote `SECURITY_MODEL.md` from the threat model behind the 2026-11-26 security scan: same owner answers, now with nine named components (adds MCP agent API and Demo mode), the fail-closed Supabase rule, and a Security Invariants section per vulnerability class. Open findings from that scan: no posting-length cap on `/api/jd` / `createFromJd`, and `interviewer_ratings` unique key missing `user_id`.

## 2026-11-25 - Fail closed without Supabase

Middleware and workspace resolution refuse requests without the Supabase URL and publishable key. To use the shared CVbuilder workspace locally without credentials, opt in with `LOCAL_DEMO_MODE=true npm run dev`. A production build can be made without credentials, but production requests cannot use the local demo. The fictional public demo still uses `DEMO_MAX_VISITORS` on configured deployments.
