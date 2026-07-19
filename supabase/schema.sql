-- Run this file once in Supabase Dashboard -> SQL Editor.

create table if not exists public.trip_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  share_token uuid unique,
  updated_at timestamptz not null default now()
);

alter table public.trip_plans add column if not exists share_token uuid unique;

-- Email invitations let the owner share one itinerary without sharing an account.
create table if not exists public.trip_collaborators (
  trip_owner_id uuid not null references auth.users(id) on delete cascade,
  invite_email text not null,
  member_id uuid references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (trip_owner_id, invite_email),
  unique (trip_owner_id, member_id)
);

alter table public.trip_collaborators enable row level security;
revoke all on table public.trip_collaborators from anon;
grant select, insert, update, delete on table public.trip_collaborators to authenticated;

drop policy if exists "Owners manage trip collaborators" on public.trip_collaborators;
create policy "Owners manage trip collaborators"
on public.trip_collaborators for all to authenticated
using ((select auth.uid()) = trip_owner_id)
with check ((select auth.uid()) = trip_owner_id);

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
using (
  (select auth.uid()) = user_id
  or exists (select 1 from public.trip_collaborators where trip_owner_id = trip_plans.user_id and member_id = (select auth.uid()))
)
with check (
  (select auth.uid()) = user_id
  or exists (select 1 from public.trip_collaborators where trip_owner_id = trip_plans.user_id and member_id = (select auth.uid()) and role = 'editor')
);

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
