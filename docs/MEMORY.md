# Work log (newest first)

Keep this file updated at the end of every working session: what was done, decisions taken, what's next. CLAUDE.md holds the stable rules; this holds the moving state. Keep only the last two or three sessions here - move older entries to docs/MEMORY-archive.md so a fresh session stays cheap to start.

## 2026-11-09 - Security scan + threat model (Devin)

Added `SECURITY_MODEL.md` at the repo root: trust boundaries, named components, entry points, assets,
attackers and the owner's risk decisions (open OAuth sign-up is intended; LLM keys are capped / free
tier so quota abuse is low impact; nothing out of scope). Security scans start from it, so update it
when a boundary, entry point or risk decision changes. No code or schema change.
- First scan found 3 low findings: no max input length / rate limit on AI server actions and
  `/api/jd`, and an unchecked `next` redirect in `app/auth/callback/route.ts`.

**Next:** the findings are optional hardening (cap prompt text length; validate `next` is a relative path).

## 2026-10-29 - Interview prep on the application page (ROADMAP Now #2, shipped)

`/app/applications/[id]` has a new panel, "Interview prep for this application": for each competency
the JD implies (`inferCompetencies` via `prepSet`'s gap report) it shows **story ready** (the story's
Result), **CV line only** (the first line on this application's CV that evidences it, plus a count of
others), or **gap**, with a "practise" link to the first bank question with that competency
(`/app/interview?tab=behavioural&firm=all&q=<id>`) and a "question bank" link. A collapsed list
shows each CV line with its backing story (pinned or same-project), "needs a story", number
mismatches, and CV ids no longer in the bank. Rules only, zero tokens.
- New pure helper `lib/stories/prep-view.ts` `competencyPrep` (7 tests); exported from `lib/stories`.
- CV line text on the page now goes through one `shownText` (override > chosen variant > bank text).
- Process map step "Prep for this exact application" lost `coming` and is now `auto`.
- No schema change. `stakeholder-management` has no bank question, so it shows no practise link.

**Next:** no form writes `stories` yet, so live prep shows only "CV line only" or "gap". A story
capture form (`draftStory`/`saveStory`) is the natural follow-on; otherwise ROADMAP Now #1 / #3.

## 2026-09-25 (morning) - Sourcing filter in the app; hero card shows the whole loop

**Job filter (ROADMAP Now #1, first half - shipped).** `lib/watchlist/targets.ts` (tested): a role is
kept if its location contains a target city and its title contains a target phrase as WHOLE words,
and no excluded phrase ("intern" never hits "internal"). Empty lists filter nothing. Used by
`refreshWatchlist` (the in-app button, which had no filter and could flood the table) AND
`scripts/source-singapore.ts` (its hardcoded regexes are gone; it refuses to run with no targets).
- Data: profile columns `target_titles`, `excluded_titles` (migration **0003, applied live**;
  mirrored in schema.sql). Parag's phrases are DATA in `data/cvbuilder/archetypes.json`:
  `titleKeywords` per role family + top-level `excludedTitleKeywords`; the importer unions them.
- Editable on `/app/watchlist` ("What you are looking for": cities / titles to keep / to drop).
- Live: set the two columns directly (NOT `db:seed`, which would reset app-edited applications),
  ran the real refresh (153 matches), and dismissed the 9 saved roles that no longer match
  (designers, an intern role, product-ops specialists). 161 open. Engineering-manager roles now
  appear because that is one of Parag's five role families - he can drop it on the watchlist page.

**Hero card** now plays the whole loop: sourcing, networking, applying, interview, then Improve (loop
arc lights, ring returns to start), round two, offer. Each frame is tagged AI / automatic / soon. On
wrap the ring re-mounts and fades in instead of sliding back (the old glitch). H1 is now "From the
first search to the final offer."; the lede says negotiation is coming.

Tooling note: in this Bash tool, `\\n` inside a heredoc arrives as `\n` - use the Edit tool (or a
separate file) for code containing escape sequences.

**Next:** rest of ROADMAP Now #1 - daily cron + retire closed roles (several roles marked `new` are
already gone from their boards).
