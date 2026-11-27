-- 0022: interviewer ratings are keyed per user, and only on your own interviews.
--
-- 0019 made interviewer_ratings unique on (session_id, turn_index) and its "own rows" policy
-- checked only user_id. Another user could insert a row pointing at your session (foreign
-- keys ignore RLS); your upsert then conflicted with their row, hidden from you, and failed.
-- Now the key includes user_id, and a row may only point at a session you own. Rows that
-- already point at someone else's session are removed.
--
-- Reversible: see the commented "down" block at the end.

delete from interviewer_ratings r
where not exists (
  select 1 from interview_full_sessions s where s.id = r.session_id and s.user_id = r.user_id
);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.interviewer_ratings'::regclass and conname = 'interviewer_ratings_user_id_session_id_turn_index_key') then
    alter table interviewer_ratings add constraint interviewer_ratings_user_id_session_id_turn_index_key unique (user_id, session_id, turn_index);
  end if;
end $$;
alter table interviewer_ratings drop constraint if exists interviewer_ratings_session_id_turn_index_key;

drop policy if exists "own rows" on interviewer_ratings;
create policy "own rows" on interviewer_ratings for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from interview_full_sessions s where s.id = session_id and s.user_id = auth.uid())
  );

-- down:
-- drop policy if exists "own rows" on interviewer_ratings;
-- create policy "own rows" on interviewer_ratings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- alter table interviewer_ratings drop constraint if exists interviewer_ratings_user_id_session_id_turn_index_key;
-- alter table interviewer_ratings add constraint interviewer_ratings_session_id_turn_index_key unique (session_id, turn_index);
