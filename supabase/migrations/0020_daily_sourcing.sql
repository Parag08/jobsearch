alter table profiles add column if not exists daily_sourcing_target integer not null default 20
  check (daily_sourcing_target > 0);
alter table profiles add column if not exists sourcing_evidence text[] not null default '{}'
  check (sourcing_evidence <@ array['discovery','prioritization','delivery','measurement','experimentation','stakeholders','operations','technical-design']);

create table if not exists sourcing_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  name text not null check (length(name) between 1 and 160),
  identity text not null,
  website text,
  active boolean not null default true,
  research jsonb not null default '[]',
  research_version integer not null default 0,
  research_requested boolean not null default false,
  unique (user_id, identity),
  unique (user_id, website),
  unique (user_id, id)
);

alter table sourcing_companies enable row level security;
drop policy if exists "own rows" on sourcing_companies;
create policy "own rows" on sourcing_companies
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.sourcing_company_identity(name text)
returns text language sql immutable set search_path = '' as $$
  select lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))
$$;

insert into sourcing_companies(user_id, name, identity, active)
select user_id, min(company), public.sourcing_company_identity(company), bool_or(active)
from watchlist
where length(btrim(company)) between 1 and 160
group by user_id, public.sourcing_company_identity(company)
on conflict (user_id, identity) do nothing;

alter table watchlist add column if not exists company_id uuid;
alter table watchlist add column if not exists last_attempt_at timestamptz;
alter table watchlist add column if not exists last_success_at timestamptz;
alter table watchlist add column if not exists last_check_failed boolean;
alter table sourced_jobs add column if not exists company_id uuid;
alter table sourced_jobs add column if not exists sourcing_decision text
  check (sourcing_decision in ('picked', 'later', 'dismissed', 'available'));
update sourced_jobs set status = 'new', sourcing_decision = coalesce(sourcing_decision, 'dismissed')
where status = 'dismissed';
alter table sourced_jobs add column if not exists sourcing_review jsonb;
alter table applications add column if not exists company_id uuid;
alter table applications add column if not exists sourcing_kit jsonb;
alter table applications add column if not exists sourcing_revision integer not null default 0;
alter table contacts add column if not exists company_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.applications'::regclass and conname = 'safe_sourcing_fields') then
    alter table public.applications add constraint safe_sourcing_fields check (
      sourcing_kit is null or (
        jd_raw is null and jd_extract is null and cv_id is null and cover_letter is null and status_note is null and
        ((sourcing_kit ->> 'submission' is null and applied_at is null and stage in ('saved', 'closed')) or
         (sourcing_kit ->> 'submission' is not null and applied_at is not null and
          (sourcing_kit -> 'submission' ->> 'date') is not distinct from applied_at::text and stage <> 'saved'))
      )
    );
  end if;
end $$;

create or replace function public.keep_sourcing_submission()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.sourcing_kit is not null and (
    new.sourcing_kit is null or old.company is distinct from new.company or
    old.role is distinct from new.role or old.external_ref is distinct from new.external_ref or
    old.apply_url is distinct from new.apply_url or
    (old.sourcing_kit ->> 'submission' is not null and
      (old.sourcing_kit is distinct from new.sourcing_kit or old.sourcing_revision is distinct from new.sourcing_revision))
  ) then
    raise exception 'Safe application identity and submitted content cannot change.';
  end if;
  return new;
end
$$;

drop trigger if exists keep_sourcing_submission on applications;
create trigger keep_sourcing_submission before update on applications
  for each row execute function public.keep_sourcing_submission();

create or replace function public.link_sourcing_company()
returns trigger language plpgsql set search_path = '' as $$
begin
  select c.id into new.company_id
  from public.sourcing_companies c
  where c.user_id = new.user_id and c.identity = public.sourcing_company_identity(new.company);
  return new;
end
$$;

create or replace function public.relink_sourcing_company()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.watchlist set company_id = new.id where user_id = new.user_id
    and public.sourcing_company_identity(company) = new.identity;
  update public.sourced_jobs set company_id = new.id where user_id = new.user_id
    and public.sourcing_company_identity(company) = new.identity;
  update public.applications set company_id = new.id where user_id = new.user_id
    and public.sourcing_company_identity(company) = new.identity;
  update public.contacts set company_id = new.id where user_id = new.user_id
    and public.sourcing_company_identity(company) = new.identity;
  return new;
end
$$;

do $$
declare t text;
begin
  foreach t in array array['watchlist','sourced_jobs','applications','contacts'] loop
    if not exists (select 1 from pg_constraint where conrelid = format('public.%I', t)::regclass and conname = 'sourcing_company_fk') then
      execute format('alter table public.%I add constraint sourcing_company_fk foreign key (user_id, company_id) references public.sourcing_companies(user_id, id)', t);
    end if;
    execute format('create index if not exists %I on public.%I (user_id, company_id)', t || '_sourcing_company', t);
    execute format('drop trigger if exists link_sourcing_company on public.%I', t);
    execute format('create trigger link_sourcing_company before insert or update of company, user_id on public.%I for each row execute function public.link_sourcing_company()', t);
    execute format('update public.%I x set company_id = c.id from public.sourcing_companies c where x.company_id is null and x.user_id = c.user_id and public.sourcing_company_identity(x.company) = c.identity', t);
  end loop;
end $$;

drop trigger if exists relink_sourcing_company on sourcing_companies;
create trigger relink_sourcing_company after insert on sourcing_companies
  for each row execute function public.relink_sourcing_company();
