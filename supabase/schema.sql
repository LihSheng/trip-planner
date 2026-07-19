-- Run this file once in Supabase Dashboard -> SQL Editor.

create table if not exists public.trip_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.trip_plans enable row level security;

revoke all on table public.trip_plans from anon;
grant select, insert, update, delete on table public.trip_plans to authenticated;

drop policy if exists "Users manage their own trip" on public.trip_plans;
create policy "Users manage their own trip"
on public.trip_plans
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
