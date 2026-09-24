-- 0002 · case interview sessions (DESIGN.md section 3)
--
-- One row per attempt at a case from data/interview/cases.json. `session` holds the whole
-- CaseSession (turns, current question, math checks) and is saved after every turn, so an
-- interview survives a refresh. Finishing adds the scored debrief. Transcript text only -
-- no audio is ever stored.
--
-- Idempotent: safe on the live project and on a fresh project built from schema.sql.

create table if not exists case_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  case_id text not null,                              -- id from data/interview/cases.json
  status text not null default 'running' check (status in ('running', 'done')),
  session jsonb not null,
  scores jsonb,                                       -- {structure, analytics, ...} each 1-5, once done
  overall numeric(3, 1),
  strengths text[] not null default '{}',
  improvements text[] not null default '{}',
  per_question jsonb,
  model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists case_sessions_user_case on case_sessions (user_id, case_id, created_at desc);

alter table case_sessions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'case_sessions' and policyname = 'own rows') then
    create policy "own rows" on case_sessions for all
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
