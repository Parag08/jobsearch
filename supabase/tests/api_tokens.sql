\set ON_ERROR_STOP on
begin;

insert into auth.users (id) values ('5d0b8f4e-2a61-4c0e-9a57-0e8f3b7d2c11');
set local role authenticated;
set local request.jwt.claim.sub = '5d0b8f4e-2a61-4c0e-9a57-0e8f3b7d2c11';

do $$
declare
  owner_id uuid := '5d0b8f4e-2a61-4c0e-9a57-0e8f3b7d2c11';
  made jsonb;
begin
  assert public.create_api_token(owner_id, 'laptop', repeat('a', 64), 'write', 36500) is null,
    'Token made with a lifetime outside 30, 90 or 365 days';
  assert public.create_api_token(gen_random_uuid(), 'laptop', repeat('a', 64), 'write', 90) is null,
    'Token made for another user';
  made := public.create_api_token(owner_id, 'laptop', repeat('a', 64), 'write', 90);
  assert made is not null and made ->> 'window_count' = '0', 'Token not made through create_api_token';

  begin
    update public.api_tokens set window_count = 0, expires_at = '2100-01-01';
    assert false, 'Owner rewrote the rate-limit window and expiry';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.api_tokens (user_id, name, token_hash) values (owner_id, 'chosen', repeat('b', 64));
    assert false, 'Owner inserted a token row directly';
  exception when insufficient_privilege then null;
  end;

  update public.api_tokens set revoked_at = now();
  begin
    update public.api_tokens set revoked_at = null;
    assert false, 'Owner un-revoked a token';
  exception when insufficient_privilege then null;
  end;
  assert (select bool_and(revoked_at is not null) from public.api_tokens), 'Owner could not revoke a token';
end
$$;

rollback;
