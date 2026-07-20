alter table public.trip_collaborators drop column if exists trip_owner_id cascade;
alter table public.trip_plans drop column if exists user_id cascade;
