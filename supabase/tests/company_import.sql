\set ON_ERROR_STOP on
begin;

insert into auth.users (id) values ('ccf17c1f-ebc7-495e-8f60-a13772429029');
set local role authenticated;
set local request.jwt.claim.sub = 'ccf17c1f-ebc7-495e-8f60-a13772429029';

do $$
declare
  owner_id uuid := 'ccf17c1f-ebc7-495e-8f60-a13772429029';
  import_id uuid := '14b7c166-fde2-4143-98e8-97720893ea45';
  plan jsonb := jsonb_build_array(jsonb_build_object('name', 'İşbank', 'identity', U&'i\0307şbank'));
  receipt jsonb;
begin
  assert public.apply_company_import(owner_id, import_id, '[{"name":"İşbank","identity":"unrelated"}]', 0) is null,
    'Import accepted an identity that does not match the company name';
  receipt := public.apply_company_import(owner_id, import_id, plan, 0);
  assert receipt is not null and receipt ->> 'new_count' = '1', 'Import rejected the reviewed Unicode company name';
end
$$;

reset role;
do $$
begin
  assert exists (
    select from public.sourcing_companies
    where user_id = 'ccf17c1f-ebc7-495e-8f60-a13772429029' and name = 'İşbank' and identity = U&'i\0307şbank'
  ), 'Import did not store the reviewed identity';
end
$$;

rollback;
