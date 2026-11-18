-- 0013: a model answer per role-interview question.
--
-- Written by the agent from the user's own evidence (never invented claims); shown on the
-- interview tab so the user can read it, then answer in their own words, and given to the
-- mock debrief to compare against. The length limit is enforced by the app
-- (lib/interview/role-questions.ts); the check here is only a backstop.

alter table interview_role_questions add column if not exists model_answer text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'interview_role_questions_model_answer_len'
  ) then
    alter table interview_role_questions
      add constraint interview_role_questions_model_answer_len
      check (model_answer is null or char_length(model_answer) <= 8000);
  end if;
end $$;
