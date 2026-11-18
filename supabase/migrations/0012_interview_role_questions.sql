-- 0012: role interviews - questions prepared for one application's real interview.
--
-- interview_role_questions: written by an agent over MCP (upsert_interview_questions) from
-- research the user asked for. Its question id is 'role:' || id, which is what
-- interview_answers.question_id and interview_attempts.question_id hold, so answers and
-- attempts stay with it when the set is pushed again (upsert on user_id + external_ref).
-- Removing a question deletes only this row; answers and attempts are kept. Length limits
-- are enforced by the app (lib/interview/role-questions.ts); the checks here are a backstop.

create table if not exists interview_role_questions (
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
create index if not exists interview_role_questions_app on interview_role_questions (user_id, application_id, position);

alter table interview_role_questions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'interview_role_questions' and policyname = 'own rows'
  ) then
    create policy "own rows" on interview_role_questions for all
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
