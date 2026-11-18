-- 0013: model answers - a strong spoken answer per question, per user.
--
-- interview_model_answers: one row per (user_id, question_id), where question_id is any
-- interview question id (bank id, 'role:...', 'custom:...', 'company:...'), the same key
-- interview_answers and interview_attempts use. source says who wrote it: 'agent' (over
-- MCP, from the user's evidence), 'ai' (the app's rewrite of the user's written answer) or
-- 'user'. The page shows it above the mock interview and the debrief compares against it.
-- An agent never overwrites an 'ai' or 'user' answer unless forced (lib/interview/model-answer.ts).
-- The length limit is enforced by the app; the check here is only a backstop.

create table if not exists interview_model_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  question_id text not null,
  text text not null check (char_length(text) between 1 and 8000),
  source text not null check (source in ('agent', 'ai', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

alter table interview_model_answers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'interview_model_answers' and policyname = 'own rows'
  ) then
    create policy "own rows" on interview_model_answers for all
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
