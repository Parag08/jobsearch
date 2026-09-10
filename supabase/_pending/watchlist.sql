-- ============================================================================
-- PENDING: watchlist table (DESIGN.md section 4, company-targeted sourcing).
--
-- Not yet folded into supabase/schema.sql. Per the drop-and-recreate policy,
-- the intended landing is: paste the `create type` + `create table` blocks
-- into schema.sql under a new "-- ---- M7 watchlist ----" section, add
-- 'watchlist' to the RLS foreach array, and re-apply the whole file. This file
-- is written so it can ALSO be run standalone against a live DB (idempotent).
--
-- Row shape is mirrored by WatchlistRow in lib/repos/watchlist.ts.
-- ============================================================================

do $$ begin
  create type ats_kind as enum ('greenhouse','lever','ashby','smartrecruiters','unknown');
exception when duplicate_object then null; end $$;

create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  company text not null,                             -- the declared target's display name
  careers_url text not null,                         -- what the user pasted
  ats ats_kind not null default 'unknown',           -- derived by lib/watchlist/ats.ts, or set by hand
  token text,                                        -- board token / company slug for the public API
  active boolean not null default true,              -- inactive entries are kept but not refreshed
  added_at date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, careers_url)
);

alter table watchlist enable row level security;

do $$ begin
  create policy "own rows" on watchlist for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create index if not exists watchlist_user_active_idx on watchlist (user_id, active);
