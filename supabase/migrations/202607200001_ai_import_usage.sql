create table if not exists public.ai_import_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('text')),
  model text not null,
  status text not null check (status in ('started', 'completed', 'failed', 'rejected')),
  input_characters integer not null default 0,
  output_place_count integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists ai_import_usage_user_created_idx on public.ai_import_usage (user_id, created_at desc);
alter table public.ai_import_usage enable row level security;
revoke all on table public.ai_import_usage from anon, authenticated;
