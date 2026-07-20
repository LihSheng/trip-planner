-- Run this file once in Supabase Dashboard -> SQL Editor.

create table if not exists public.trip_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null,
  share_token uuid unique,
  updated_at timestamptz not null default now()
);

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

-- Email invitations let the owner share one itinerary without sharing an account.
create table if not exists public.trip_collaborators (
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  invite_email text not null,
  member_id uuid references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (trip_plan_id, invite_email),
  unique (trip_plan_id, member_id)
);

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

alter table public.trip_collaborators drop column if exists trip_owner_id cascade;
alter table public.trip_plans drop column if exists user_id cascade;

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

alter table public.trip_collaborators enable row level security;
revoke all on table public.trip_collaborators from anon;
grant select, insert, update, delete on table public.trip_collaborators to authenticated;

drop policy if exists "Owners manage trip collaborators" on public.trip_collaborators;
create policy "Owners manage trip collaborators"
on public.trip_collaborators for all to authenticated
using (public.owns_trip_plan(trip_plan_id))
with check (public.owns_trip_plan(trip_plan_id));

drop policy if exists "Collaborators view their memberships" on public.trip_collaborators;
create policy "Collaborators view their memberships"
on public.trip_collaborators for select to authenticated
using ((select auth.uid()) = member_id);

alter table public.trip_plans enable row level security;
revoke all on table public.trip_plans from anon;
grant select, insert, update, delete on table public.trip_plans to authenticated;

drop policy if exists "Users manage their own trip" on public.trip_plans;
create policy "Users manage their own trip"
on public.trip_plans for all to authenticated
using (public.can_access_trip_plan(id, owner_id, false))
with check (public.can_access_trip_plan(id, owner_id, true));

-- Called after magic-link sign-in. The email comparison happens in the database,
-- so an invite cannot be claimed by another signed-in account.
create or replace function public.accept_trip_invitations()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trip_collaborators
  set member_id = auth.uid(), accepted_at = coalesce(accepted_at, now())
  where member_id is null
    and lower(invite_email) = lower(coalesce(auth.jwt() ->> 'email', ''));
end;
$$;

revoke all on function public.accept_trip_invitations() from public;
grant execute on function public.accept_trip_invitations() to authenticated;

create or replace function public.get_shared_trip(requested_share_token uuid)
returns table(state jsonb)
language sql
security definer
set search_path = public
as $$
  select trip_plans.state
  from public.trip_plans
  where trip_plans.share_token = requested_share_token
  limit 1;
$$;

revoke all on function public.get_shared_trip(uuid) from public;
grant execute on function public.get_shared_trip(uuid) to anon, authenticated;

-- AI import quota ledger. Edge Functions access this through the service role;
-- browser clients intentionally receive no table privileges.
create table if not exists public.ai_import_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_plan_id uuid references public.trip_plans(id) on delete set null,
  source_type text not null check (source_type in ('text', 'url')),
  model text not null,
  status text not null check (status in ('started', 'completed', 'failed', 'rejected')),
  input_characters integer not null default 0,
  output_place_count integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.ai_import_usage add column if not exists trip_plan_id uuid references public.trip_plans(id) on delete set null;
create index if not exists ai_import_usage_user_created_idx on public.ai_import_usage (user_id, created_at desc);
alter table public.ai_import_usage enable row level security;
revoke all on table public.ai_import_usage from anon, authenticated;
