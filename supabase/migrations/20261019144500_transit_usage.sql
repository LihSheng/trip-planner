alter table public.ai_import_usage drop constraint if exists ai_import_usage_source_type_check;
alter table public.ai_import_usage add constraint ai_import_usage_source_type_check
  check (source_type in ('text', 'url', 'transit'));

create index if not exists ai_import_usage_user_source_created_idx
  on public.ai_import_usage (user_id, source_type, created_at desc);
create index if not exists ai_import_usage_transit_recent_idx
  on public.ai_import_usage (created_at desc) where source_type = 'transit';

-- Transit rows share this ledger, so the AI cap must count only AI sources.
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
  if p_source_type is null or p_source_type not in ('text', 'url') then
    raise exception 'Invalid AI import source type';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  select count(*)::integer
  into recent_count
  from public.ai_import_usage
  where user_id = p_user_id
    and source_type in ('text', 'url')
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

create or replace function public.reserve_transit_usage(
  p_user_id uuid,
  p_daily_limit integer,
  p_per_minute_limit integer
)
returns table (outcome text, reservation_id uuid, resets_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  minute_count integer;
  day_count integer;
  oldest_counted timestamptz;
  new_id uuid;
begin
  if p_daily_limit < 1 or p_daily_limit > 1000 or p_per_minute_limit < 1 or p_per_minute_limit > 100 then
    raise exception 'Invalid transit limits';
  end if;

  -- One global lock, because the per-minute budget protects the provider for all users together.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('transit-routes', 0));

  -- Every attempt counts here, failed ones too: they still reached the provider.
  select count(*)::integer
  into minute_count
  from public.ai_import_usage
  where source_type = 'transit'
    and created_at >= pg_catalog.now() - interval '1 minute';

  if minute_count >= p_per_minute_limit then
    return query select 'busy'::text, null::uuid, null::timestamptz;
    return;
  end if;

  -- Failed rows are refunded from the user's daily quota: only started and completed lookups count.
  select count(*)::integer, min(created_at)
  into day_count, oldest_counted
  from public.ai_import_usage
  where user_id = p_user_id
    and source_type = 'transit'
    and status in ('started', 'completed')
    and created_at >= pg_catalog.now() - interval '24 hours';

  if day_count >= p_daily_limit then
    return query select 'limit'::text, null::uuid, oldest_counted + interval '24 hours';
    return;
  end if;

  insert into public.ai_import_usage (user_id, trip_plan_id, source_type, model, status, input_characters)
  values (p_user_id, null, 'transit', 'transitous', 'started', 0)
  returning id into new_id;

  return query select 'reserved'::text, new_id, null::timestamptz;
end;
$$;

revoke execute on function public.reserve_transit_usage(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_transit_usage(uuid, integer, integer) to service_role;
