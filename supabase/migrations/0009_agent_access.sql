-- 0009: agent access (the MCP endpoint at /api/mcp).
--
-- api_tokens: a personal token lets an agent act as its owner over MCP. Only the
-- SHA-256 hash is stored; the token itself is shown once, on creation. Owners manage
-- their own rows under RLS; the MCP route looks a hash up with the secret key.
--
-- external_ref: the id a record has in the system it was imported from (for Parag,
-- the findparagjob role id / the outreach-log person). It makes agent upserts
-- idempotent: the same ref always lands on the same row.
-- apply_url / status_note: where to apply, and the evidence behind the current stage
-- ("confirmed by the user 2026-11-04; Gmail receipt 2026-11-03").

create table if not exists api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (user_id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table api_tokens enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'api_tokens' and policyname = 'own rows'
  ) then
    create policy "own rows" on api_tokens for all
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

alter table applications add column if not exists external_ref text;
alter table applications add column if not exists apply_url text;
alter table applications add column if not exists status_note text;
create unique index if not exists applications_user_external_ref
  on applications (user_id, external_ref) where external_ref is not null;

alter table contacts add column if not exists external_ref text;
create unique index if not exists contacts_user_external_ref
  on contacts (user_id, external_ref) where external_ref is not null;
