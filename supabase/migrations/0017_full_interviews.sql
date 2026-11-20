-- 0017: full mock interviews and role-plays (docs/FULL-INTERVIEW.md).
--
-- interview_full_sessions: one row per full mock interview of one application's round. `session`
--   is the whole FullSession (the plan snapshot, settings and every turn with the move code
--   allowed and the interviewer chose), saved after every turn like case_sessions, so a refresh
--   does not lose a 40-minute interview. Finishing adds the debrief. Never overwritten by a new
--   attempt: the history is the progress.
-- interview_role_plays: one sample interviewer-candidate exchange per user and question id (any
--   kind, like interview_model_answers). `based_on` fingerprints the model answer it was built
--   from, so the page can say when it is stale. source 'ai' (built in the app) or 'agent' (MCP).
--
-- Reversible: see the commented "down" block at the end.

create table if not exists interview_full_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  -- null = a general practice interview from the question bank, for no company.
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
create index if not exists interview_full_sessions_user_app on interview_full_sessions (user_id, application_id, created_at desc);

create table if not exists interview_role_plays (
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

alter table interview_full_sessions enable row level security;
alter table interview_role_plays enable row level security;

do $$
declare t text;
begin
  foreach t in array array['interview_full_sessions', 'interview_role_plays']
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'own rows') then
      execute format('create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
    end if;
  end loop;
end $$;

-- down:
-- drop table if exists interview_role_plays;
-- drop table if exists interview_full_sessions;
