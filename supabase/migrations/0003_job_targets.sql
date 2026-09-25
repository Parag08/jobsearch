-- 0003 · job targets on the profile (lib/watchlist/targets.ts)
--
-- The in-app watchlist refresh had no role or location filter, so one large board could
-- flood sourced_jobs with hundreds of postings in every city. It now keeps only roles in
-- the profile's target_geos (already a column) whose title contains one of target_titles
-- and none of excluded_titles - whole words, case-insensitive. Empty lists filter nothing.
--
-- Idempotent: safe on the live project and on a fresh project built from schema.sql.

alter table profiles add column if not exists target_titles text[] not null default '{}';
alter table profiles add column if not exists excluded_titles text[] not null default '{}';
