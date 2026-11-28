-- Apply a watchlist retirement plan without overwriting a changed status or board.
create or replace function public.apply_sourced_job_retirement(p_user_id uuid, p_updates jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.sourced_jobs as job
  set missed_refreshes = plan.missed_refreshes, status = plan.status
  from jsonb_to_recordset(p_updates) as plan(
    id uuid, prior_status public.sourced_status, status public.sourced_status,
    sourcing_board_url text, missed_refreshes integer
  )
  where job.user_id = p_user_id
    and job.id = plan.id
    and job.status = plan.prior_status
    and job.sourcing_board_url is not distinct from plan.sourcing_board_url;
$$;

revoke all on function public.apply_sourced_job_retirement(uuid, jsonb) from public, anon;
grant execute on function public.apply_sourced_job_retirement(uuid, jsonb) to authenticated, service_role;
