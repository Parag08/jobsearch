-- 0011: your own interview questions.
--
-- interview_custom_questions: a question the user typed on the interview page, to practise
-- and be scored on like a bank question. Its question id is 'custom:' || id, which is what
-- interview_answers.question_id and interview_attempts.question_id hold, so answers and
-- attempts stay with it. Removing a question deletes only this row; the hand-written
-- answer and the attempts are kept. The length limit is enforced by the app
-- (INTERVIEW_CUSTOM_QUESTION_MAX_CHARS); the check here is only a backstop.

create table if not exists interview_custom_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists interview_custom_questions_user on interview_custom_questions (user_id, created_at desc);

alter table interview_custom_questions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'interview_custom_questions' and policyname = 'own rows'
  ) then
    create policy "own rows" on interview_custom_questions for all
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
