-- 0010: role plans (the Role insights page).
--
-- role_plans: the "gap plan" a user asks for on a role family's insights page. It is
-- generated text, kept so it survives a reload and can be read back later. One row per
-- (user, role_family): asking again replaces the plan. Owners manage their own rows
-- under RLS.

create table if not exists role_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  role_family text not null,
  plan jsonb not null,
  generated_at timestamptz not null default now(),
  unique (user_id, role_family)
);

alter table role_plans enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'role_plans' and policyname = 'own rows'
  ) then
    create policy "own rows" on role_plans for all
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
