-- PROPOSED, NOT APPLIED. Schema additions for the editorial layer (lib/editorial/).
-- schema.sql is the canonical model and is still under drop-and-recreate policy: if
-- accepted, fold these into schema.sql in place (do not run this file on its own).
--
-- Why: application_cvs stores the recipe (master, diff, resolved order, summary) but
-- none of the editorial decisions that produced it. Without them "Why this bullet?"
-- (ONBOARDING.md screen 6) cannot be answered after the fact, and the page-fit trade
-- ("short variant instead of a cut") is invisible once made. CvDiff.variants and
-- CvDiff.overrides already live inside `diff`, so no new columns for those.

-- ---- application_cvs: the editorial record ---------------------------------------
alter table application_cvs
  -- Pin[] from lib/editorial/select.ts: [{bulletId, reason}] - reason is the point.
  add column pins jsonb not null default '[]',
  -- SelectionDecision[]: one row per considered bullet
  -- {bulletId, included, kind: pinned|excluded|capped|scored|unknown, reason, score, orgId}.
  add column decisions jsonb not null default '[]',
  -- Page model the CV was fitted against, and what fitting did:
  -- {pageSize: 'A4'|'Letter', scale, overheadLines, linesUsed, lineBudget, overflow,
  --  actions: FitAction[] ({kind:'short-variant'|'drop', bulletId, linesSaved, from?})}.
  add column page_fit jsonb,
  -- DESIGN.md §2 "freeze on send": resolved text per bullet, written exactly once on the
  -- transition to `applied`. NULL while the application is a live recipe in `saved`.
  -- [{bulletId, text}] in page order, plus the summary line as sent.
  add column sent_snapshot jsonb,
  add column sent_at timestamptz;

-- ---- per-org cap: user data, never a code constant (CLAUDE.md rule 4) ------------
-- Onboarding screen 3 asks per role: full story / one-liner / omit. The cap that
-- composeSelection consumes (orgCaps: Record<orgId, number>) derives from it:
-- omit -> excluded, one-liner -> cap 1 (or 2 by user preference), full -> no cap.
-- Stored on the project (the org/role row), so a peer's data carries its own caps.
alter table projects
  add column depth text not null default 'full'
    check (depth in ('full', 'one-liner', 'omit')),
  -- explicit override of the derived cap; NULL = derive from depth.
  add column bullet_cap smallint check (bullet_cap is null or bullet_cap >= 0);

-- Note: the seed generator (lib/import/seed-sql.ts) would need to emit `depth`/`bullet_cap`
-- for the corpus orgs, and lib/repos/cvs.ts would need to read/write the new jsonb
-- columns. Both are code changes outside lib/editorial and are not made here.
