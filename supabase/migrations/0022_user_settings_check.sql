-- 0022: user_settings.values may only hold short text settings (defence in depth).
--
-- The `own rows` policy lets a signed-in user write their own row straight through PostgREST,
-- around the Settings form. The app checks every stored value again when it reads it
-- (lib/settings/registry.ts#settingsEnv: registry bounds, choices and the model allow-list), so
-- a bad value only ever falls back to the deployment's. This constraint also keeps the column
-- itself sane: a JSON object of at most 64 env-style keys, each a string of at most 200 characters.
--
-- NOT VALID: enforced on every new write without failing on a row saved before it existed.
-- Reversible: see the commented "down" block at the end.

create or replace function public.user_settings_values_ok(v jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(v) = 'object'
     and (select count(*) from jsonb_object_keys(v)) <= 64
     and not exists (
       select 1 from jsonb_each(v) e
       where e.key !~ '^[A-Z][A-Z0-9_]{0,63}$'
          or jsonb_typeof(e.value) <> 'string'
          or length(e.value #>> '{}') > 200
     );
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_settings_values_ok' and conrelid = 'public.user_settings'::regclass) then
    alter table public.user_settings add constraint user_settings_values_ok check (public.user_settings_values_ok(values)) not valid;
  end if;
end $$;

-- down:
-- alter table public.user_settings drop constraint if exists user_settings_values_ok;
-- drop function if exists public.user_settings_values_ok(jsonb);
