create or replace function public.reserve_ai_import_usage(
  p_user_id uuid,
  p_trip_plan_id uuid,
  p_source_type text,
  p_model text,
  p_input_characters integer,
  p_daily_limit integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reservation_id uuid;
  recent_count integer;
begin
  if p_daily_limit < 1 or p_daily_limit > 1000 then
    raise exception 'Invalid AI import daily limit';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  select count(*)::integer
  into recent_count
  from public.ai_import_usage
  where user_id = p_user_id
    and created_at >= pg_catalog.now() - interval '24 hours';

  if recent_count >= p_daily_limit then
    return null;
  end if;

  insert into public.ai_import_usage (
    user_id,
    trip_plan_id,
    source_type,
    model,
    status,
    input_characters
  )
  values (
    p_user_id,
    p_trip_plan_id,
    p_source_type,
    p_model,
    'started',
    p_input_characters
  )
  returning id into reservation_id;

  return reservation_id;
end;
$$;

revoke execute on function public.reserve_ai_import_usage(uuid, uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_import_usage(uuid, uuid, text, text, integer, integer) to service_role;
