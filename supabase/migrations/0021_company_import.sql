create table if not exists public.company_imports (
  id uuid not null,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null,
  new_count integer not null check (new_count >= 0),
  reused_count integer not null check (reused_count >= 0),
  skipped_count integer not null check (skipped_count >= 0),
  undone_count integer check (undone_count between 0 and new_count + reused_count),
  company_ids uuid[] not null default '{}',
  primary key (user_id, id)
);

create index if not exists company_imports_latest on public.company_imports (user_id, created_at desc);
alter table public.company_imports enable row level security;
drop policy if exists "read own imports" on public.company_imports;
create policy "read own imports" on public.company_imports for select using (user_id = auth.uid());
revoke all on public.company_imports from anon, authenticated;
grant select on public.company_imports to authenticated;

alter table public.sourcing_companies add column if not exists import_id uuid;

create or replace function public.apply_company_import(
  p_user_id uuid, p_id uuid, p_plan jsonb default null, p_skipped integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  receipt public.company_imports;
  r record;
  newest timestamptz;
  n_new integer := 0;
  n_reused integer := 0;
  removed uuid[];
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() or p_id is null then return null; end if;
  perform 1 from public.profiles where user_id = p_user_id for no key update;
  if not found then return null; end if;

  select * into receipt from public.company_imports where user_id = p_user_id and id = p_id;
  select max(created_at) into newest from public.company_imports where user_id = p_user_id;
  if p_plan is null then
    if receipt.id is null or receipt.created_at <> newest then return null; end if;
    if receipt.undone_count is not null then return to_jsonb(receipt); end if;

    with changed as (
      update public.sourcing_companies set active = false, import_id = null
      where user_id = p_user_id and active and import_id = p_id returning id
    ) select coalesce(array_agg(id), '{}') into removed from changed;

    update public.sourced_jobs j set sourcing_decision = 'available'
    where j.user_id = p_user_id and j.company_id = any(removed)
      and (j.sourcing_decision = 'picked' or (j.sourcing_decision is null and j.status = 'shortlisted'))
      and not exists (
        select 1 from public.applications a where a.user_id = p_user_id and a.external_ref = 'sourced:' || j.id
      );

    update public.company_imports set undone_count = cardinality(removed)
    where user_id = p_user_id and id = p_id returning * into receipt;
    return to_jsonb(receipt);
  end if;

  if receipt.id is not null then return to_jsonb(receipt); end if;
  if jsonb_typeof(p_plan) <> 'array' then return null; end if;
  if p_skipped is null or p_skipped < 0 or p_skipped > 1000 or
     jsonb_array_length(p_plan) not between 1 and 1000 - p_skipped then return null; end if;
  if (select count(distinct x ->> 'identity') from jsonb_array_elements(p_plan) x) <> jsonb_array_length(p_plan) then return null; end if;

  for r in select * from jsonb_to_recordset(p_plan) as x(id uuid, name text, identity text, website text, active boolean) order by id loop
    if r.id is not null then
      if r.name is not null or r.active is null then return null; end if;
      perform 1 from public.sourcing_companies c where c.user_id = p_user_id and c.id = r.id
        and c.identity = r.identity and c.website is not distinct from r.website and c.active = r.active for update;
      if not found then return null; end if;
      if not r.active then n_reused := n_reused + 1; end if;
    else
      if r.active is not null or r.name is null or length(r.name) not between 1 and 160
        or r.name !~ '[[:alpha:]]' or r.name ~ '([0-9]{4,}|[[:cntrl:]])'
        or r.name collate pg_catalog."C" !~ U&'^[[:alnum:] .&''()+,\0080-\D7FF\E000-\+10FFFF-]+$'
        or r.name <> btrim(regexp_replace(r.name, '[[:space:]]+', ' ', 'g'))
        or r.identity <> public.sourcing_company_identity(r.name) then return null; end if;
      if r.website is not null and (length(r.website) > 261 or
        r.website !~ '^https://([a-z0-9-]+\.)+[a-z]{2,63}$' or r.website ~ '^https://www\.'
        or r.website ~ '\.(local|localhost|internal|test|invalid|example)$') then return null; end if;
      if exists (select 1 from public.sourcing_companies c where c.user_id = p_user_id and
        (c.identity = r.identity or c.website = r.website)) then return null; end if;
      n_new := n_new + 1;
    end if;
  end loop;
  if n_new + n_reused = 0 then return null; end if;

  insert into public.company_imports (id, user_id, created_at, new_count, reused_count, skipped_count)
  values (p_id, p_user_id, greatest(clock_timestamp(), newest + interval '1 microsecond'), n_new, n_reused, p_skipped)
  returning * into receipt;

  with created as (
    insert into public.sourcing_companies (user_id, name, identity, website, active, import_id)
    select p_user_id, x.name, x.identity, x.website, true, p_id
    from jsonb_to_recordset(p_plan) as x(id uuid, name text, identity text, website text) where x.id is null returning id
  ), reactivated as (
    update public.sourcing_companies c set active = true, import_id = p_id
    from jsonb_to_recordset(p_plan) as x(id uuid, active boolean)
    where c.user_id = p_user_id and c.id = x.id and not x.active returning c.id
  )
  update public.company_imports set company_ids = array(select id from created union all select id from reactivated)
  where user_id = p_user_id and id = p_id returning * into receipt;
  return to_jsonb(receipt);
exception when unique_violation or invalid_text_representation then
  return null;
end
$$;

revoke all on function public.apply_company_import(uuid, uuid, jsonb, integer) from public, anon;
grant execute on function public.apply_company_import(uuid, uuid, jsonb, integer) to authenticated;
