-- ============================================================================
-- JobPilot database data model - THE canonical schema file.
--
-- Policy (agreed 2026-08-29): until there is live data, we do NOT keep
-- incremental migrations. Edit this file in place and re-run it wholesale -
-- it drops everything and recreates it. Once real data exists, switch to
-- numbered migrations in supabase/migrations/ and freeze this file.
--
-- Multi-user by design (spec section 7): every table carries user_id with
-- row-level security; "INSEAD" and "Singapore" are data, not schema.
-- Run in the Supabase SQL editor or: supabase db execute --file supabase/schema.sql
-- ============================================================================

-- ---- teardown (full replace, no live data yet) -----------------------------
drop table if exists token_ledger cascade;
drop table if exists briefs cascade;
drop table if exists sourced_jobs cascade;
drop table if exists interactions cascade;
drop table if exists contacts cascade;
drop table if exists applications cascade;
drop table if exists application_cvs cascade;
drop table if exists master_cvs cascade;
drop table if exists bullets cascade;
drop table if exists projects cascade;
drop table if exists sectors cascade;
drop table if exists profiles cascade;
drop type if exists app_stage cascade;
drop type if exists closed_reason cascade;
drop type if exists warmth_level cascade;
drop type if exists contact_status cascade;
drop type if exists interaction_channel cascade;
drop type if exists sourced_status cascade;

-- ---- enums ------------------------------------------------------------------
create type app_stage as enum
  ('saved','applied','screening','interview','case','offer','negotiation','closed');
create type closed_reason as enum ('won','lost','withdrawn','ghosted');
create type warmth_level as enum ('cold','warm','hot');
create type contact_status as enum
  ('not-contacted','awaiting-reply','in-conversation','met','dormant');
create type interaction_channel as enum ('linkedin','whatsapp','email','coffee','call');
create type sourced_status as enum ('new','shortlisted','tracked','dismissed');

-- ---- profiles: one row per user (workspace root) ----------------------------
create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  target_geos text[] not null default '{}',          -- e.g. {Singapore}
  role_families text[] not null default '{}',        -- e.g. {product-management}
  networks jsonb not null default '[]',              -- [{name:"INSEAD", fields:[...]}]
  visa_context text,                                 -- e.g. EP/COMPASS note
  premium_llm_budget_usd_month numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ---- M1 sector graph ---------------------------------------------------------
create table sectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  path text[] not null,                              -- {IT,AI,Singapore}
  role_family text,
  skills jsonb not null default '{}',                -- {"sql": 3, ...} frequency map
  companies text[] not null default '{}',
  titles text[] not null default '{}',
  jd_count int not null default 0,
  summary text not null default '',                  -- cached ~150-token summary
  updated_at timestamptz not null default now(),
  unique (user_id, path)
);

-- ---- M2 project repository ----------------------------------------------------
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  name text not null,
  org text not null default '',
  dates text,
  role text,
  narrative text not null default '',
  outcomes text[] not null default '{}',
  skills text[] not null default '{}',
  sector_tags uuid[] not null default '{}',          -- sectors.id refs (soft)
  created_at timestamptz not null default now()
);

create table bullets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  role_family text not null,
  text text not null,
  skills text[] not null default '{}'
);

-- ---- M3 CV builder --------------------------------------------------------------
create table master_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  role_family text not null,
  summary_line text not null default '',
  bullet_ids uuid[] not null default '{}',           -- curated order
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, role_family, version)
);

create table application_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  master_cv_id uuid not null references master_cvs (id),
  diff jsonb not null,                               -- CvDiff: add/remove/keywords/summary
  bullet_ids uuid[] not null default '{}',           -- resolved final order
  summary_line text not null default '',
  file_path text,                                    -- exported DOCX/PDF location
  created_at timestamptz not null default now()
);

-- ---- M5 application tracker ------------------------------------------------------
create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  company text not null,
  role text not null,
  sector_id uuid references sectors (id) on delete set null,
  stage app_stage not null default 'saved',
  closed_reason closed_reason,
  jd_extract jsonb,                                  -- parse-once JdExtract (raw JD never stored twice)
  jd_raw text,                                       -- original text, kept for audit only
  cv_id uuid references application_cvs (id) on delete set null,
  referral_contact_id uuid,                          -- fk added below (contacts defined after)
  next_action text,
  saved_at date not null default current_date,
  applied_at date,
  updated_at timestamptz not null default now(),
  constraint closed_needs_reason check (stage <> 'closed' or closed_reason is not null)
);

-- ---- M4 outreach CRM ---------------------------------------------------------------
create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  name text not null,
  network jsonb,                                     -- {name:"INSEAD", class:"MBA 22J", campus:"Singapore"}
  company text,
  role text,
  location text,
  warmth warmth_level not null default 'cold',
  status contact_status not null default 'not-contacted',
  interests text[] not null default '{}',
  next_followup date,
  rolling_summary text not null default '',          -- token rule: short summary in prompts, raw log below
  created_at timestamptz not null default now()
);

alter table applications
  add constraint applications_referral_fk
  foreign key (referral_contact_id) references contacts (id) on delete set null;

create table interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  date date not null default current_date,
  channel interaction_channel not null,
  summary text not null,
  raw_text text                                      -- full note, never sent to prompts
);

-- ---- M7 sourcing -------------------------------------------------------------------
create table sourced_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  source text not null,                              -- adzuna | jooble | jsearch | manual
  external_id text,
  title text not null,
  company text not null default '',
  location text,
  url text,
  posted_at date,
  score int,
  status sourced_status not null default 'new',
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

-- ---- M6 daily briefs ---------------------------------------------------------------
create table briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  date date not null,
  items jsonb not null default '[]',                 -- [{title, why, url}]
  unique (user_id, date)
);

-- ---- token economy ------------------------------------------------------------------
create table token_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles (user_id) on delete cascade,
  date date not null default current_date,
  module text not null,                              -- process-jd | tailor-cv | outreach | brief | source
  model text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0
);

-- ---- row-level security: each user sees only their workspace -------------------------
alter table profiles enable row level security;
alter table sectors enable row level security;
alter table projects enable row level security;
alter table bullets enable row level security;
alter table master_cvs enable row level security;
alter table application_cvs enable row level security;
alter table applications enable row level security;
alter table contacts enable row level security;
alter table interactions enable row level security;
alter table sourced_jobs enable row level security;
alter table briefs enable row level security;
alter table token_ledger enable row level security;

create policy "own profile" on profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['sectors','projects','bullets','master_cvs','application_cvs',
                           'applications','contacts','interactions','sourced_jobs','briefs','token_ledger']
  loop
    execute format(
      'create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
  end loop;
end $$;

-- ---- helpful indexes -------------------------------------------------------------------
create index on applications (user_id, stage);
create index on contacts (user_id, next_followup);
create index on interactions (contact_id, date desc);
create index on sourced_jobs (user_id, status, score desc);
create index on bullets (user_id, role_family);
