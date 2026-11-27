-- ============================================================================
-- JobSearch database data model - THE canonical schema file.
--
-- Policy (switched 2026-09-24): the live project now changes ONLY through numbered,
-- additive migrations in supabase/migrations/ (npm run db:migrate). Interview answers
-- are typed by hand into the app and nothing can regenerate them, so drop-and-recreate
-- is over for the live database.
--
-- This file remains the complete snapshot: use it to build a FRESH project, then run
-- db:migrate. Every schema change goes in a migration first and is mirrored here.
-- Running this file against the live project destroys user data; db-apply refuses to
-- unless given --force-drop.
--
-- Multi-user by design (spec section 7): every table carries user_id with
-- row-level security; "INSEAD" and "Singapore" are data, not schema.
-- Run in the Supabase SQL editor or: supabase db execute --file supabase/schema.sql
-- ============================================================================

-- ---- teardown (full replace, no live data yet) -----------------------------
drop table if exists interview_mock_sessions cascade;
drop table if exists ai_calls cascade;
drop table if exists company_imports cascade;
drop table if exists sourcing_companies cascade;
drop table if exists interviewer_ratings cascade;
drop table if exists user_settings cascade;
drop table if exists interview_role_plays cascade;
drop table if exists interview_full_sessions cascade;
drop table if exists interview_model_answers cascade;
drop table if exists interview_role_questions cascade;
drop table if exists interview_custom_questions cascade;
drop table if exists role_plans cascade;
drop table if exists api_tokens cascade;
drop table if exists token_ledger cascade;
drop table if exists case_sessions cascade;
drop table if exists interview_attempts cascade;
drop table if exists interview_answers cascade;
drop table if exists stories cascade;
drop table if exists companies cascade;
drop table if exists watchlist cascade;
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
drop type if exists ats_kind cascade;

-- ---- enums ------------------------------------------------------------------
create type app_stage as enum
  ('saved','applied','screening','interview','case','offer','negotiation','closed');
create type closed_reason as enum ('won','lost','withdrawn','ghosted');
create type warmth_level as enum ('cold','warm','hot');
create type contact_status as enum
  ('not-contacted','awaiting-reply','in-conversation','met','dormant');
create type interaction_channel as enum ('linkedin','whatsapp','email','coffee','call');
create type sourced_status as enum ('new','shortlisted','tracked','dismissed','closed');
create type ats_kind as enum ('greenhouse','lever','ashby','smartrecruiters','unknown');

-- ---- profiles: one row per user (workspace root) ----------------------------
create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  target_geos text[] not null default '{}',          -- e.g. {Singapore}
  role_families text[] not null default '{}',        -- e.g. {product-management}
  target_titles text[] not null default '{}',        -- title phrases the watchlist keeps (0003)
  excluded_titles text[] not null default '{}',      -- title phrases it drops (0003)
  networks jsonb not null default '[]',              -- [{name:"INSEAD", fields:[...]}]
  visa_context text,                                 -- e.g. EP/COMPASS note
  premium_llm_budget_usd_month numeric not null default 0,
  contact_lines text[] not null default '{}',        -- CV header: linkedin, emails, phones
  cv_extras jsonb not null default '[]',             -- CV closing blocks: [{id,label,text,locked,tailorable}]
  org_caps jsonb not null default '{}',              -- org name -> max CV points (0005)
  taxonomy jsonb not null default '{}',              -- {tags: {tag: [jd phrases]}, seniorityHints} for the CV scorer (0008)
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
  -- editorial depth (ONBOARDING.md screen 3): full story / one-liner / omit. The per-org
  -- cap composeSelection consumes derives from it; bullet_cap overrides explicitly.
  depth text not null default 'full' check (depth in ('full', 'one-liner', 'omit')),
  bullet_cap smallint check (bullet_cap is null or bullet_cap >= 0),
  created_at timestamptz not null default now()
);

create table bullets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  role_family text not null,
  text text not null,
  skills text[] not null default '{}',
  variants jsonb not null default '[]',              -- [{label,text}] re-angled wordings of the SAME fact
  strength int not null default 3 check (strength between 1 and 5)
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
  -- editorial record (lib/editorial): why each bullet is on the page, and the page fit
  pins jsonb not null default '[]',                  -- [{bulletId, reason}]
  decisions jsonb not null default '[]',             -- [{bulletId, included, kind, reason, score, orgId}]
  page_fit jsonb,                                    -- {pageSize, scale, linesUsed, lineBudget, overflow, actions[]}
  -- DESIGN.md section 2 "freeze on send": resolved text as sent, written once on -> applied.
  -- NULL while the application is a live recipe in `saved`.
  sent_snapshot jsonb,                               -- {bullets: [{bulletId, text}], summaryLine}
  sent_at timestamptz,
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
  cover_letter jsonb,                                -- the drafted letter (0007)
  external_ref text,                                 -- id in the system it was imported from (0009)
  apply_url text,                                    -- where to apply (0009)
  status_note text,                                  -- evidence behind the current stage (0009)
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
  external_ref text,                                 -- id in the system it was imported from (0009)
  linkedin_url text,                                 -- pasted profile link, never fetched (0015)
  created_at timestamptz not null default now()
);
create unique index contacts_user_external_ref on contacts (user_id, external_ref) where external_ref is not null;

create unique index applications_user_external_ref on applications (user_id, external_ref) where external_ref is not null;

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
  missed_refreshes int not null default 0,             -- migration 0004
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

-- ---- feature 4: watchlist - declared target companies, sourced from their own ATS ----------
create table watchlist (
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

-- ---- company directory: CENTRAL, the one table with no user_id --------------------
-- Shared reference data (DESIGN.md section 4): every user reads the same rows, so a
-- board verified once is verified for everyone. A `watchlist` row is the personal act
-- of following one of these; the directory itself belongs to nobody.
-- Written by `npm run companies:sync` from data/singapore/companies.json.
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                         -- display name; the upsert key
  type text not null,                                -- how they hire: bank | us-tech-apac | ...
  careers_url text not null,                         -- human-facing careers page
  ats ats_kind not null default 'unknown',           -- VERIFIED by scripts/probe-boards.mjs
  token text,                                        -- board token, verified alongside ats
  confirmed boolean not null default false,          -- a human checked it is the right employer
  probed_at date,
  created_at timestamptz not null default now()
);

-- ---- feature 3: STAR stories - captured, never generated ---------------------------------
create table stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  bullet_id uuid references bullets (id) on delete set null,   -- nullable: a story may back one CV bullet
  situation text not null default '',
  task text not null default '',
  action text not null default '',
  result text not null,                                         -- no Result, no STAR
  competencies text[] not null default '{}',                    -- labels from the user's vocabulary (data, not enum)
  numbers text[] not null default '{}',                         -- metric strings as the user said them
  captured_at date not null default current_date,
  external_ref text,                                            -- the agent workspace's stable id (0016)
  source text not null default 'user' check (source in ('user', 'agent')),  -- who typed it in (0016)
  provenance text,                                              -- where the facts came from; required for agent stories (0016)
  updated_at timestamptz,                                       -- (0016)
  constraint result_not_blank check (length(btrim(result)) > 0),
  constraint stories_agent_provenance check (source <> 'agent' or length(btrim(coalesce(provenance, ''))) > 0)
);
create unique index stories_user_external_ref on stories (user_id, external_ref) where external_ref is not null;

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

-- ---- interview answers + practice (migration 0001) ---------------------------------------
-- One written answer per (user, question id from data/interview/questions.json), both the
-- free-text and STAR drafts kept. Attempts are append-only and store the transcript only -
-- audio is never kept.
create table interview_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  question_id text not null,
  mode text not null default 'star' check (mode in ('free', 'star')),
  body text not null default '',
  situation text not null default '',
  task text not null default '',
  action text not null default '',
  result text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

create table interview_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  question_id text not null,
  transcript text not null,
  duration_seconds int,
  scores jsonb not null,
  overall numeric(3, 1) not null,
  strengths text[] not null default '{}',
  improvements text[] not null default '{}',
  model text not null default '',
  created_at timestamptz not null default now()
);
create index interview_attempts_user_question on interview_attempts (user_id, question_id, created_at desc);

-- Case interviews (migration 0002): the whole session is saved every turn.
create table case_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  case_id text not null,
  status text not null default 'running' check (status in ('running', 'done')),
  session jsonb not null,
  scores jsonb,
  overall numeric(3, 1),
  strengths text[] not null default '{}',
  improvements text[] not null default '{}',
  per_question jsonb,
  model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index case_sessions_user_case on case_sessions (user_id, case_id, created_at desc);

-- ---- agent access: personal tokens for the MCP endpoint /api/mcp (0009) -------------
-- Only the SHA-256 hash is stored; the token is shown once, on creation.
-- scope, expiry and the per-token rate-limit window came in 0014.
create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  scope text not null default 'write' constraint api_tokens_scope_check check (scope in ('read', 'write')),
  expires_at timestamptz not null default (now() + interval '90 days'),
  window_start timestamptz,
  window_count integer not null default 0
);

-- ---- role insights: one generated gap plan per role family (0010) -------------------
create table role_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  role_family text not null,
  plan jsonb not null,
  generated_at timestamptz not null default now(),
  unique (user_id, role_family)
);

-- ---- your own interview questions (0011): question id is 'custom:' || id ---------------
create table interview_custom_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now(),
  external_ref text,                                 -- the agent workspace's stable id (0016)
  competency text,                                   -- optional, overrides the shared template's (0016)
  tag text                                           -- optional label, e.g. 'drill' (0016)
);
create index interview_custom_questions_user on interview_custom_questions (user_id, created_at desc);
create unique index interview_custom_questions_user_external_ref on interview_custom_questions (user_id, external_ref) where external_ref is not null;

-- ---- role interviews (0012): prepared for one application's real interview; id 'role:' || id
create table interview_role_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  application_id uuid not null references applications (id) on delete cascade,
  external_ref text not null,
  round text,
  interviewer text,
  position integer not null default 0,
  competency text not null,
  text text not null check (char_length(text) between 1 and 2000),
  short text,
  look_for text not null check (char_length(look_for) between 1 and 4000),
  context text check (context is null or char_length(context) <= 4000),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_ref)
);
create index interview_role_questions_app on interview_role_questions (user_id, application_id, position);

-- ---- model answers (0013): one per user and question id; source agent | ai | user -------
create table interview_model_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  question_id text not null,
  text text not null check (char_length(text) between 1 and 8000),
  source text not null check (source in ('agent', 'ai', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

-- ---- full mock interviews and role-plays (0017, docs/FULL-INTERVIEW.md) ----------------
create table interview_full_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  application_id uuid references applications (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'done')),
  session jsonb not null,
  scores jsonb,
  overall numeric(3, 1),
  strengths text[] not null default '{}',
  improvements text[] not null default '{}',
  per_topic jsonb,
  moments jsonb,
  model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interview_full_sessions_user_app on interview_full_sessions (user_id, application_id, created_at desc);

create table interview_role_plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  question_id text not null,
  lines jsonb not null,
  source text not null check (source in ('ai', 'agent')),
  based_on text not null,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

-- Per-user settings (0018): env key -> the user's own value; only keys in lib/settings/registry.ts count.
create table user_settings (
  user_id uuid primary key references profiles (user_id) on delete cascade,
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Your verdict on the interviewer's lines (0019): good / bad, and what it should have asked.
create table interviewer_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  session_id uuid not null references interview_full_sessions (id) on delete cascade,
  turn_index integer not null check (turn_index >= 0),
  rating text not null check (rating in ('good', 'bad')),
  better text,
  updated_at timestamptz not null default now(),
  unique (session_id, turn_index)
);
create index interviewer_ratings_user on interviewer_ratings (user_id);

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
alter table watchlist enable row level security;
alter table stories enable row level security;
alter table interview_answers enable row level security;
alter table interview_attempts enable row level security;
alter table case_sessions enable row level security;
alter table api_tokens enable row level security;
alter table role_plans enable row level security;
alter table interview_custom_questions enable row level security;
alter table interview_role_questions enable row level security;
alter table interview_model_answers enable row level security;
alter table interview_full_sessions enable row level security;
alter table interview_role_plays enable row level security;
alter table user_settings enable row level security;
alter table interviewer_ratings enable row level security;
alter table token_ledger enable row level security;

create policy "own profile" on profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The directory is the exception to "each user sees only their workspace": it is shared
-- reference data with no user_id, so every signed-in user reads every row. No insert,
-- update or delete policy exists at all - `npm run companies:sync` writes it with the
-- service key, which bypasses RLS. That asymmetry is deliberate: a shared table anyone
-- can write is a shared table anyone can poison.
alter table companies enable row level security;
create policy "directory is readable by any signed-in user" on companies
  for select to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['sectors','projects','bullets','master_cvs','application_cvs',
                           'applications','contacts','interactions','sourced_jobs','briefs',
                           'watchlist','stories','token_ledger',
                           'interview_answers','interview_attempts','case_sessions','api_tokens','role_plans',
                           'interview_custom_questions','interview_role_questions','interview_model_answers',
                           'interview_full_sessions','interview_role_plays','user_settings','interviewer_ratings']
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
create index on watchlist (user_id, active);
create index on stories (user_id, bullet_id);
create index on stories (user_id, project_id);

-- ---- new-user provisioning --------------------------------------------------------------
-- Every table's user_id references profiles(user_id), so a profiles row must exist before
-- the app can write anything. OAuth sign-up creates only the auth.users row - this trigger
-- creates the matching profile. It sits on auth.users rather than in the callback route so
-- that it cannot be bypassed: dashboard invites, magic links and any future auth method all
-- insert into auth.users too. security definer, because the inserting role is not the user.
--
-- It creates a MINIMAL profile: identity only. Targets, geographies, languages and visa
-- context are collected by onboarding screen 1 (docs/ONBOARDING.md), not guessed here.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- The teardown above drops public tables only; this trigger lives on auth.users and
-- survives a re-run, so it is dropped explicitly.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: any auth.users row that predates this trigger (e.g. the owner account created
-- by hand in the dashboard) still needs a profile. Idempotent.
insert into public.profiles (user_id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')
from auth.users u
on conflict (user_id) do nothing;

-- ---- daily sourcing (migration 0020) ----------------------------------------------
alter table profiles add column if not exists daily_sourcing_target integer not null default 20
  check (daily_sourcing_target > 0);
alter table profiles add column if not exists sourcing_evidence text[] not null default '{}'
  check (sourcing_evidence <@ array['discovery','prioritization','delivery','measurement','experimentation','stakeholders','operations','technical-design']);

create table if not exists sourcing_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  name text not null check (length(name) between 1 and 160),
  identity text not null,
  website text,
  active boolean not null default true,
  research jsonb not null default '[]',
  research_version integer not null default 0,
  research_requested boolean not null default false,
  unique (user_id, identity),
  unique (user_id, website),
  unique (user_id, id)
);

alter table sourcing_companies enable row level security;
drop policy if exists "own rows" on sourcing_companies;
create policy "own rows" on sourcing_companies
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.sourcing_company_identity(name text)
returns text language sql immutable set search_path = '' as $$
  select lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))
$$;

insert into sourcing_companies(user_id, name, identity, active)
select user_id, min(company), public.sourcing_company_identity(company), bool_or(active)
from watchlist
where length(btrim(company)) between 1 and 160
group by user_id, public.sourcing_company_identity(company)
on conflict (user_id, identity) do nothing;

alter table watchlist add column if not exists company_id uuid;
alter table watchlist add column if not exists last_attempt_at timestamptz;
alter table watchlist add column if not exists last_success_at timestamptz;
alter table watchlist add column if not exists last_check_failed boolean;
alter table sourced_jobs add column if not exists company_id uuid;
alter table sourced_jobs add column if not exists sourcing_board_url text;
alter table sourced_jobs add column if not exists sourcing_decision text
  check (sourcing_decision in ('picked', 'later', 'dismissed', 'available'));
update sourced_jobs set status = 'new', sourcing_decision = coalesce(sourcing_decision, 'dismissed')
where status = 'dismissed';
alter table sourced_jobs add column if not exists sourcing_review jsonb;
alter table applications add column if not exists company_id uuid;
alter table applications add column if not exists sourcing_kit jsonb;
alter table applications add column if not exists sourcing_revision integer not null default 0;
alter table contacts add column if not exists company_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.applications'::regclass and conname = 'safe_sourcing_fields') then
    alter table public.applications add constraint safe_sourcing_fields check (
      sourcing_kit is null or (
        jd_raw is null and jd_extract is null and cv_id is null and cover_letter is null and status_note is null and
        ((sourcing_kit ->> 'submission' is null and applied_at is null and stage in ('saved', 'closed')) or
         (sourcing_kit ->> 'submission' is not null and applied_at is not null and
          (sourcing_kit -> 'submission' ->> 'date') is not distinct from applied_at::text and stage <> 'saved'))
      )
    );
  end if;
end $$;

create or replace function public.keep_sourcing_submission()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.sourcing_kit is not null and (
    new.sourcing_kit is null or old.company is distinct from new.company or
    old.role is distinct from new.role or old.external_ref is distinct from new.external_ref or
    old.apply_url is distinct from new.apply_url or
    (old.sourcing_kit ->> 'submission' is not null and
      (old.sourcing_kit is distinct from new.sourcing_kit or old.sourcing_revision is distinct from new.sourcing_revision))
  ) then
    raise exception 'Safe application identity and submitted content cannot change.';
  end if;
  return new;
end
$$;

drop trigger if exists keep_sourcing_submission on applications;
create trigger keep_sourcing_submission before update on applications
  for each row execute function public.keep_sourcing_submission();

create or replace function public.link_sourcing_company()
returns trigger language plpgsql set search_path = '' as $$
begin
  select c.id into new.company_id
  from public.sourcing_companies c
  where c.user_id = new.user_id and c.identity = public.sourcing_company_identity(new.company);
  return new;
end
$$;

create or replace function public.relink_sourcing_company()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.watchlist set company_id = new.id where user_id = new.user_id
    and public.sourcing_company_identity(company) = new.identity;
  update public.sourced_jobs set company_id = new.id where user_id = new.user_id
    and public.sourcing_company_identity(company) = new.identity;
  update public.applications set company_id = new.id where user_id = new.user_id
    and public.sourcing_company_identity(company) = new.identity;
  update public.contacts set company_id = new.id where user_id = new.user_id
    and public.sourcing_company_identity(company) = new.identity;
  return new;
end
$$;

do $$
declare t text;
begin
  foreach t in array array['watchlist','sourced_jobs','applications','contacts'] loop
    if not exists (select 1 from pg_constraint where conrelid = format('public.%I', t)::regclass and conname = 'sourcing_company_fk') then
      execute format('alter table public.%I add constraint sourcing_company_fk foreign key (user_id, company_id) references public.sourcing_companies(user_id, id)', t);
    end if;
    execute format('create index if not exists %I on public.%I (user_id, company_id)', t || '_sourcing_company', t);
    execute format('drop trigger if exists link_sourcing_company on public.%I', t);
    execute format('create trigger link_sourcing_company before insert or update of company, user_id on public.%I for each row execute function public.link_sourcing_company()', t);
    execute format('update public.%I x set company_id = c.id from public.sourcing_companies c where x.company_id is null and x.user_id = c.user_id and public.sourcing_company_identity(x.company) = c.identity', t);
  end loop;
end $$;

drop trigger if exists relink_sourcing_company on sourcing_companies;
create trigger relink_sourcing_company after insert on sourcing_companies
  for each row execute function public.relink_sourcing_company();

create table if not exists public.company_imports (
  id uuid not null,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null,
  new_count integer not null check (new_count >= 0),
  reused_count integer not null check (reused_count >= 0),
  skipped_count integer not null check (skipped_count >= 0),
  undone_count integer check (undone_count between 0 and new_count + reused_count),
  company_ids uuid[] not null default '{}',
  primary key (user_id, id)
);

create index if not exists company_imports_latest on public.company_imports (user_id, created_at desc);
alter table public.company_imports enable row level security;
drop policy if exists "read own imports" on public.company_imports;
create policy "read own imports" on public.company_imports for select using (user_id = auth.uid());
revoke all on public.company_imports from anon, authenticated;
grant select on public.company_imports to authenticated;

alter table public.sourcing_companies add column if not exists import_id uuid;

create or replace function public.apply_company_import(
  p_user_id uuid, p_id uuid, p_plan jsonb default null, p_skipped integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  receipt public.company_imports;
  r record;
  newest timestamptz;
  n_new integer := 0;
  n_reused integer := 0;
  removed uuid[];
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() or p_id is null then return null; end if;
  perform 1 from public.profiles where user_id = p_user_id for no key update;
  if not found then return null; end if;

  select * into receipt from public.company_imports where user_id = p_user_id and id = p_id;
  select max(created_at) into newest from public.company_imports where user_id = p_user_id;
  if p_plan is null then
    if receipt.id is null or receipt.created_at <> newest then return null; end if;
    if receipt.undone_count is not null then return to_jsonb(receipt); end if;

    with changed as (
      update public.sourcing_companies set active = false, import_id = null
      where user_id = p_user_id and active and import_id = p_id returning id
    ) select coalesce(array_agg(id), '{}') into removed from changed;

    update public.sourced_jobs j set sourcing_decision = 'available'
    where j.user_id = p_user_id and j.company_id = any(removed)
      and (j.sourcing_decision = 'picked' or (j.sourcing_decision is null and j.status = 'shortlisted'))
      and not exists (
        select 1 from public.applications a where a.user_id = p_user_id and a.external_ref = 'sourced:' || j.id
      );

    update public.company_imports set undone_count = cardinality(removed)
    where user_id = p_user_id and id = p_id returning * into receipt;
    return to_jsonb(receipt);
  end if;

  if receipt.id is not null then return to_jsonb(receipt); end if;
  if jsonb_typeof(p_plan) <> 'array' then return null; end if;
  if p_skipped is null or p_skipped < 0 or p_skipped > 1000 or
     jsonb_array_length(p_plan) not between 1 and 1000 - p_skipped then return null; end if;
  if (select count(distinct x ->> 'identity') from jsonb_array_elements(p_plan) x) <> jsonb_array_length(p_plan) then return null; end if;

  for r in select * from jsonb_to_recordset(p_plan) as x(id uuid, name text, identity text, website text, active boolean) order by id loop
    if r.id is not null then
      if r.name is not null or r.active is null then return null; end if;
      perform 1 from public.sourcing_companies c where c.user_id = p_user_id and c.id = r.id
        and c.identity = r.identity and c.website is not distinct from r.website and c.active = r.active for update;
      if not found then return null; end if;
      if not r.active then n_reused := n_reused + 1; end if;
    else
      if r.active is not null or r.name is null or length(r.name) not between 1 and 160
        or r.name !~ '[[:alpha:]]' or r.name ~ '([0-9]{4,}|[[:cntrl:]])'
        or r.name collate pg_catalog."C" !~ U&'^[[:alnum:] .&''()+,\0080-\D7FF\E000-\+10FFFF-]+$'
        or r.name <> btrim(regexp_replace(r.name, '[[:space:]]+', ' ', 'g'))
        or r.identity <> lower(r.name collate pg_catalog."und-x-icu") then return null; end if;
      if r.website is not null and (length(r.website) > 261 or
        r.website !~ '^https://([a-z0-9-]+\.)+[a-z]{2,63}$' or r.website ~ '^https://www\.'
        or r.website ~ '\.(local|localhost|internal|test|invalid|example)$') then return null; end if;
      if exists (select 1 from public.sourcing_companies c where c.user_id = p_user_id and
        (c.identity = r.identity or c.website = r.website)) then return null; end if;
      n_new := n_new + 1;
    end if;
  end loop;
  if n_new + n_reused = 0 then return null; end if;

  insert into public.company_imports (id, user_id, created_at, new_count, reused_count, skipped_count)
  values (p_id, p_user_id, greatest(clock_timestamp(), newest + interval '1 microsecond'), n_new, n_reused, p_skipped)
  returning * into receipt;

  with created as (
    insert into public.sourcing_companies (user_id, name, identity, website, active, import_id)
    select p_user_id, x.name, x.identity, x.website, true, p_id
    from jsonb_to_recordset(p_plan) as x(id uuid, name text, identity text, website text) where x.id is null returning id
  ), reactivated as (
    update public.sourcing_companies c set active = true, import_id = p_id
    from jsonb_to_recordset(p_plan) as x(id uuid, active boolean)
    where c.user_id = p_user_id and c.id = x.id and not x.active returning c.id
  )
  update public.company_imports set company_ids = array(select id from created union all select id from reactivated)
  where user_id = p_user_id and id = p_id returning * into receipt;
  return to_jsonb(receipt);
exception when unique_violation or invalid_text_representation then
  return null;
end
$$;

revoke all on function public.apply_company_import(uuid, uuid, jsonb, integer) from public, anon;
grant execute on function public.apply_company_import(uuid, uuid, jsonb, integer) to authenticated;

-- ---- per-user model call limit and server-side quick mock interviews (0022) ------------
-- ai_calls is written only by take_ai_call (lib/services/ai-write.ts); interview_mock_sessions
-- holds the running quick mock interview so the browser never sends it back.
create table if not exists public.ai_calls (
  id bigint generated always as identity primary key,
  -- auth.users, not profiles: a user may delete their own profile row, and that must not clear the count.
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists ai_calls_user_at on public.ai_calls (user_id, at);
alter table public.ai_calls enable row level security;
revoke all on public.ai_calls from anon, authenticated;

-- 0 = allowed and recorded; n > 0 = refused, retry in n seconds; null = not this caller's user.
create or replace function public.take_ai_call(p_user_id uuid, p_limit integer, p_window_seconds integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  -- A hard ceiling on rows per user per day, whatever limit a direct caller passes.
  ceiling constant integer := 5000;
  lim integer := least(greatest(coalesce(p_limit, 1), 1), ceiling);
  win interval := make_interval(secs => least(greatest(coalesce(p_window_seconds, 3600), 60), 86400));
  now_ timestamptz := clock_timestamp();
  used integer;
  frees timestamptz;
begin
  if p_user_id is null or (p_user_id is distinct from auth.uid() and coalesce(auth.role(), '') <> 'service_role') then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('take_ai_call:' || p_user_id::text, 0));
  -- The window is at most a day, so older rows never count again.
  delete from public.ai_calls where user_id = p_user_id and at <= now_ - interval '1 day';
  select count(*) into used from public.ai_calls where user_id = p_user_id and at > now_ - win;
  if used >= lim then
    select at into frees from public.ai_calls where user_id = p_user_id and at > now_ - win
      order by at asc offset used - lim limit 1;
    return greatest(1, ceil(extract(epoch from (frees + win - now_)))::integer);
  end if;
  select count(*) into used from public.ai_calls where user_id = p_user_id;
  if used >= ceiling then
    select at into frees from public.ai_calls where user_id = p_user_id order by at asc offset used - ceiling limit 1;
    return greatest(1, ceil(extract(epoch from (frees + interval '1 day' - now_)))::integer);
  end if;
  insert into public.ai_calls (user_id, at) values (p_user_id, now_);
  return 0;
end
$$;

revoke all on function public.take_ai_call(uuid, integer, integer) from public, anon;
grant execute on function public.take_ai_call(uuid, integer, integer) to authenticated, service_role;

create table if not exists public.interview_mock_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  question_id text not null,
  status text not null default 'running' check (status in ('running', 'done')),
  session jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interview_mock_sessions_user on public.interview_mock_sessions (user_id, updated_at desc);
alter table public.interview_mock_sessions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'interview_mock_sessions' and policyname = 'own rows') then
    create policy "own rows" on public.interview_mock_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
