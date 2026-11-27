-- 0023: owners may read, revoke and delete their agent tokens, nothing else.
--
-- Until now api_tokens had the generic "own rows" policy for all operations, so a
-- signed-in owner could PATCH window_count / window_start (the rate limit), expires_at,
-- scope or revoked_at through the REST API, or insert a row with any of them, and
-- resolveApiToken trusts every one of those columns. Now:
--   - select and delete stay with the owner;
--   - update is granted on revoked_at alone, and only to set it (no un-revoking);
--   - a token is created only through create_api_token, which takes the scope and a
--     lifetime of 30, 90 or 365 days and sets expiry and the rate-limit window itself;
--   - the rate-limit window and last_used_at are written only by the MCP route, which
--     uses the secret key (lib/db/agent.ts).

drop policy if exists "own rows" on public.api_tokens;
drop policy if exists "read own tokens" on public.api_tokens;
create policy "read own tokens" on public.api_tokens for select using (user_id = auth.uid());
drop policy if exists "revoke own tokens" on public.api_tokens;
create policy "revoke own tokens" on public.api_tokens for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and revoked_at is not null);
drop policy if exists "delete own tokens" on public.api_tokens;
create policy "delete own tokens" on public.api_tokens for delete using (user_id = auth.uid());

revoke all on public.api_tokens from anon, authenticated;
grant select, delete on public.api_tokens to authenticated;
grant update (revoked_at) on public.api_tokens to authenticated;

create or replace function public.create_api_token(
  p_user_id uuid, p_name text, p_token_hash text, p_scope text, p_days integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  made public.api_tokens;
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() then return null; end if;
  if not coalesce(length(p_name) between 1 and 60 and p_token_hash ~ '^[0-9a-f]{64}$'
                  and p_scope in ('read', 'write') and p_days in (30, 90, 365), false) then
    return null;
  end if;
  insert into public.api_tokens (user_id, name, token_hash, scope, expires_at)
  values (p_user_id, p_name, p_token_hash, p_scope, now() + make_interval(days => p_days))
  returning * into made;
  return to_jsonb(made);
end
$$;

revoke all on function public.create_api_token(uuid, text, text, text, integer) from public, anon;
grant execute on function public.create_api_token(uuid, text, text, text, integer) to authenticated;
