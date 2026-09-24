-- 0001 · interview answers and practice attempts (DESIGN.md section 3)
--
-- The first migration after the 2026-09-24 switch away from drop-and-recreate. These
-- tables hold the first data typed by hand into the app - written interview answers and
-- scored practice attempts - which nothing can regenerate, so they can no longer live in
-- a schema that is dropped on every deploy.
--
-- Idempotent throughout: safe on the live project, and safe on a fresh project that was
-- built from schema.sql (which already contains these tables).

create table if not exists interview_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  question_id text not null,                          -- id from data/interview/questions.json
  mode text not null default 'star' check (mode in ('free', 'star')),
  body text not null default '',                      -- the free-text draft
  situation text not null default '',                 -- the STAR draft, kept alongside
  task text not null default '',
  action text not null default '',
  result text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

-- Transcript only. Audio is never stored: it is personal, it is large, and nothing
-- downstream needs it once it has been transcribed and scored.
create table if not exists interview_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  question_id text not null,
  transcript text not null,
  duration_seconds int,
  scores jsonb not null,                              -- {structure, ownership, ...} each 1-5
  overall numeric(3, 1) not null,
  strengths text[] not null default '{}',
  improvements text[] not null default '{}',
  model text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists interview_attempts_user_question
  on interview_attempts (user_id, question_id, created_at desc);

alter table interview_answers enable row level security;
alter table interview_attempts enable row level security;

-- create policy has no IF NOT EXISTS, so check pg_policies to stay re-runnable.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'interview_answers' and policyname = 'own rows') then
    create policy "own rows" on interview_answers for all
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'interview_attempts' and policyname = 'own rows') then
    create policy "own rows" on interview_attempts for all
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
