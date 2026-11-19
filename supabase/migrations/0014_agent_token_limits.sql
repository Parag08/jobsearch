-- 0014: limits on agent tokens (the MCP endpoint at /api/mcp).
--
-- scope: 'read' tokens see and call only the read-only tools; 'write' tokens see all.
--   Existing tokens keep working as 'write'.
-- expires_at: every token expires. Existing tokens get 90 days from this migration;
--   new ones pick 30, 90 or 365 days on /app/agent.
-- window_start / window_count: a per-token fixed-window rate limit, kept on the row so
--   it holds across serverless instances (lib/agent/rate-limit.ts).

alter table api_tokens add column if not exists scope text not null default 'write';
alter table api_tokens add column if not exists expires_at timestamptz not null default (now() + interval '90 days');
alter table api_tokens add column if not exists window_start timestamptz;
alter table api_tokens add column if not exists window_count integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'api_tokens_scope_check') then
    alter table api_tokens add constraint api_tokens_scope_check check (scope in ('read', 'write'));
  end if;
end $$;
