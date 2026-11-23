-- 0019: your verdict on the interviewer's lines (docs/FULL-INTERVIEW.md, "Rating the interviewer").
--
-- interviewer_ratings: one row per interviewer line you rated in a full mock interview.
--   `turn_index` is the line's position in interview_full_sessions.session.turns. `rating` is
--   good or bad; `better` is what a great interviewer would have asked instead (optional, bad
--   lines only). These are the labels for the interviewer eval set (scripts/interviewer-eval.ts)
--   and, later, its training data. The interview itself is never changed.
--
-- Reversible: see the commented "down" block at the end.

create table if not exists interviewer_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  session_id uuid not null references interview_full_sessions (id) on delete cascade,
  turn_index integer not null check (turn_index >= 0),
  rating text not null check (rating in ('good', 'bad')),
  better text,
  updated_at timestamptz not null default now(),
  unique (session_id, turn_index)
);
create index if not exists interviewer_ratings_user on interviewer_ratings (user_id);

alter table interviewer_ratings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'interviewer_ratings' and policyname = 'own rows') then
    create policy "own rows" on interviewer_ratings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- down:
-- drop table if exists interviewer_ratings;
