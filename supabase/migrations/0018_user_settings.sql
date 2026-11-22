-- 0018: per-user settings (the Settings page, lib/settings/).
--
-- user_settings: one row per user. `values` maps an env key the app already reads (e.g.
--   AI_GATEWAY_INTERVIEWER_MODEL, INTERVIEW_TURN_SILENCE_MS) to the user's own value, as text,
--   exactly as it would be written in .env. Only keys in lib/settings/registry.ts are honoured;
--   secrets are never settable. A key that is absent means "use the deployment's env value".
--
-- Reversible: see the commented "down" block at the end.

create table if not exists user_settings (
  user_id uuid primary key references profiles (user_id) on delete cascade,
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_settings' and policyname = 'own rows') then
    create policy "own rows" on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- down:
-- drop table if exists user_settings;
