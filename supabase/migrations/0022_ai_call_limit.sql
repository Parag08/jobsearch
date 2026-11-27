-- 0022: a per-user limit on model calls, and the quick mock interview kept on the server.
--
-- ai_calls: one row per provider call made for a user (lib/services/ai-write.ts). No user can
--   read or write it directly; the only door is take_ai_call, which counts the caller's calls in
--   the last window and records this one only when under the limit. The window is capped at one
--   day and only older rows are deleted, so calling it directly can only add calls, never reset
--   the count; a fixed ceiling (5000 a day) bounds the rows a direct caller can add. It keys on
--   auth.users, so deleting one's own profile does not clear it.
-- interview_mock_sessions: the running quick mock interview (lib/interview/mock.ts), saved every
--   turn like interview_full_sessions, so the browser no longer sends the session back (it could
--   replay one running session for ever). Removed once it is scored.

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

-- down:
-- drop table if exists public.interview_mock_sessions;
-- drop function if exists public.take_ai_call(uuid, integer, integer);
-- drop table if exists public.ai_calls;
