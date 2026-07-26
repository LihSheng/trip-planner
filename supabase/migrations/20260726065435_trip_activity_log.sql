alter table public.trip_plans add column if not exists revision integer not null default 0;

create table if not exists public.trip_activity_events (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  type text not null check (type in ('place_added', 'place_updated', 'place_removed', 'place_moved', 'day_added', 'day_updated', 'day_removed')),
  target_name text not null,
  detail text,
  actor_id uuid not null references auth.users(id) on delete cascade,
  actor_email text not null,
  created_at timestamptz not null default now()
);

create index if not exists trip_activity_events_plan_created_idx on public.trip_activity_events (trip_plan_id, created_at desc);
alter table public.trip_activity_events enable row level security;
revoke all on public.trip_activity_events from anon;
grant select on public.trip_activity_events to authenticated;

drop policy if exists "Trip members view activity" on public.trip_activity_events;
create policy "Trip members view activity" on public.trip_activity_events for select to authenticated
using (exists (select 1 from public.trip_plans where id = trip_plan_id and public.can_access_trip_plan(id, owner_id, false)));

create or replace function public.save_trip_plan_with_activity(
  p_trip_plan_id uuid,
  p_expected_revision integer,
  p_state jsonb,
  p_events jsonb default '[]'::jsonb
) returns table(revision integer)
language plpgsql security definer set search_path = public as $$
declare
  current_revision integer;
  actor_email text := coalesce(auth.jwt() ->> 'email', 'Unknown');
begin
  select tp.revision into current_revision from public.trip_plans tp
  where tp.id = p_trip_plan_id and public.can_access_trip_plan(tp.id, tp.owner_id, true)
  for update;
  if current_revision is null then raise exception 'Trip plan is unavailable'; end if;
  if current_revision <> p_expected_revision then raise exception 'TRIP_CONFLICT'; end if;

  update public.trip_plans set state = p_state, updated_at = now(), revision = current_revision + 1
  where id = p_trip_plan_id;

  insert into public.trip_activity_events (trip_plan_id, type, target_name, detail, actor_id, actor_email)
  select p_trip_plan_id, item.type, item.target_name, item.detail, auth.uid(), actor_email
  from jsonb_to_recordset(coalesce(p_events, '[]'::jsonb)) as item(type text, target_name text, detail text)
  where item.type in ('place_added', 'place_updated', 'place_removed', 'place_moved', 'day_added', 'day_updated', 'day_removed');

  return query select current_revision + 1;
end;
$$;

revoke all on function public.save_trip_plan_with_activity(uuid, integer, jsonb, jsonb) from public;
revoke execute on function public.save_trip_plan_with_activity(uuid, integer, jsonb, jsonb) from anon;
grant execute on function public.save_trip_plan_with_activity(uuid, integer, jsonb, jsonb) to authenticated;

-- Supabase scheduled jobs run inside Postgres; keep collaboration history bounded.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-old-trip-activity';
    perform cron.schedule('purge-old-trip-activity', '15 3 * * *', 'delete from public.trip_activity_events where created_at < now() - interval ''90 days''');
  end if;
end;
$$;
