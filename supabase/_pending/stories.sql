-- ============================================================================
-- PROPOSED DDL - NOT YET APPLIED. Do not run standalone.
--
-- STAR interview stories (docs/DESIGN.md §3, the eighth module). Domain shape:
-- lib/stories/types.ts StorySchema. Stories are CAPTURED from the user, never
-- generated - this table holds what they said, in the four STAR slots.
--
-- How to land it (CLAUDE.md "Database data model"):
--   * While drop-and-recreate is still the policy: fold the blocks below into
--     supabase/schema.sql - the `drop table` line into the teardown list (before
--     `bullets`, since it references bullets and projects), the `create table`
--     after `bullets`, 'stories' into the RLS `foreach` array, the index at the end.
--   * Once schema.sql is frozen: this file becomes supabase/migrations/NNNN_stories.sql
--     as-is, minus the drop.
-- ============================================================================

-- ---- teardown (add to the drop list in schema.sql) --------------------------
drop table if exists stories cascade;

-- ---- M8 STAR interview prep ---------------------------------------------------
create table stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  bullet_id uuid references bullets (id) on delete set null,   -- nullable: a story may back one CV bullet
  situation text not null default '',
  task text not null default '',
  action text not null default '',
  result text not null,                                         -- no Result, no STAR
  competencies text[] not null default '{}',                    -- labels from the user's vocabulary (data, not enum - rule 4)
  numbers text[] not null default '{}',                         -- metric strings as the user said them: {30%,400+,$2.1M}
  captured_at date not null default current_date,
  constraint result_not_blank check (length(btrim(result)) > 0)
);

-- ---- row-level security: same posture as every other table --------------------
alter table stories enable row level security;

-- Equivalent to adding 'stories' to the `foreach t in array [...]` loop in schema.sql.
create policy "own rows" on stories for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- indexes --------------------------------------------------------------------
create index on stories (user_id, bullet_id);   -- prepSet: stories pinned to a CV bullet
create index on stories (user_id, project_id);  -- prepSet: fallback by project
