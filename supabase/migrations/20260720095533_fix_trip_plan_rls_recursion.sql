create or replace function public.can_access_trip_plan(requested_plan_id uuid, requested_owner_id uuid, require_editor boolean default false)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select (select auth.uid()) = requested_owner_id
    or exists (
      select 1
      from public.trip_collaborators
      where trip_plan_id = requested_plan_id
        and member_id = (select auth.uid())
        and (not require_editor or role = 'editor')
    );
$$;

revoke all on function public.can_access_trip_plan(uuid, uuid, boolean) from public;
grant execute on function public.can_access_trip_plan(uuid, uuid, boolean) to authenticated;

create or replace function public.owns_trip_plan(requested_plan_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.trip_plans
    where id = requested_plan_id
      and owner_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_trip_plan(uuid) from public;
grant execute on function public.owns_trip_plan(uuid) to authenticated;

drop policy if exists "Users manage their own trip" on public.trip_plans;
create policy "Users manage their own trip"
on public.trip_plans for all to authenticated
using (public.can_access_trip_plan(id, owner_id, false))
with check (public.can_access_trip_plan(id, owner_id, true));

drop policy if exists "Owners manage trip collaborators" on public.trip_collaborators;
create policy "Owners manage trip collaborators"
on public.trip_collaborators for all to authenticated
using (public.owns_trip_plan(trip_plan_id))
with check (public.owns_trip_plan(trip_plan_id));
