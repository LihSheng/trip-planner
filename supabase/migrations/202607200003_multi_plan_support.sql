alter table public.trip_plans add column if not exists id uuid default gen_random_uuid();
alter table public.trip_plans add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.trip_plans add column if not exists share_token uuid unique;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trip_plans' and column_name = 'user_id'
  ) then
    execute 'update public.trip_plans set owner_id = user_id where owner_id is null';
  end if;
end $$;

alter table public.trip_plans alter column id set not null;
alter table public.trip_plans alter column owner_id set not null;
do $$
declare
  pk_columns text;
begin
  select string_agg(a.attname, ',' order by x.ordinality)
  into pk_columns
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  join unnest(i.indkey) with ordinality as x(attnum, ordinality) on true
  join pg_attribute a on a.attrelid = c.oid and a.attnum = x.attnum
  where n.nspname = 'public' and c.relname = 'trip_plans' and i.indisprimary;

  if pk_columns is distinct from 'id' then
    alter table public.trip_plans drop constraint if exists trip_plans_pkey;
    alter table public.trip_plans add primary key (id);
  end if;
end $$;
create index if not exists trip_plans_owner_updated_idx on public.trip_plans (owner_id, updated_at desc);

alter table public.trip_collaborators add column if not exists trip_plan_id uuid references public.trip_plans(id) on delete cascade;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trip_collaborators' and column_name = 'trip_owner_id'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'trip_plans' and column_name = 'user_id'
    ) then
      execute '
        update public.trip_collaborators c
        set trip_plan_id = p.id
        from public.trip_plans p
        where c.trip_plan_id is null and p.user_id = c.trip_owner_id
      ';
    else
      execute '
        update public.trip_collaborators c
        set trip_plan_id = p.id
        from public.trip_plans p
        where c.trip_plan_id is null and p.owner_id = c.trip_owner_id
      ';
    end if;
  end if;
end $$;

alter table public.trip_collaborators alter column trip_plan_id set not null;
alter table public.trip_collaborators drop constraint if exists trip_collaborators_pkey;
alter table public.trip_collaborators drop constraint if exists trip_collaborators_trip_owner_id_member_id_key;
alter table public.trip_collaborators add primary key (trip_plan_id, invite_email);
create unique index if not exists trip_collaborators_trip_plan_member_key on public.trip_collaborators (trip_plan_id, member_id);

drop policy if exists "Owners manage trip collaborators" on public.trip_collaborators;
create policy "Owners manage trip collaborators"
on public.trip_collaborators for all to authenticated
using (exists (select 1 from public.trip_plans where trip_plans.id = trip_collaborators.trip_plan_id and trip_plans.owner_id = (select auth.uid())))
with check (exists (select 1 from public.trip_plans where trip_plans.id = trip_collaborators.trip_plan_id and trip_plans.owner_id = (select auth.uid())));

drop policy if exists "Collaborators view their memberships" on public.trip_collaborators;
create policy "Collaborators view their memberships"
on public.trip_collaborators for select to authenticated
using ((select auth.uid()) = member_id);

drop policy if exists "Users manage their own trip" on public.trip_plans;
create policy "Users manage their own trip"
on public.trip_plans for all to authenticated
using (
  (select auth.uid()) = owner_id
  or exists (select 1 from public.trip_collaborators where trip_plan_id = trip_plans.id and member_id = (select auth.uid()))
)
with check (
  (select auth.uid()) = owner_id
  or exists (select 1 from public.trip_collaborators where trip_plan_id = trip_plans.id and member_id = (select auth.uid()) and role = 'editor')
);

alter table public.ai_import_usage add column if not exists trip_plan_id uuid references public.trip_plans(id) on delete set null;
