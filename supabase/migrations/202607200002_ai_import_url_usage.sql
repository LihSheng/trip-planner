alter table public.ai_import_usage drop constraint if exists ai_import_usage_source_type_check;
alter table public.ai_import_usage add constraint ai_import_usage_source_type_check check (source_type in ('text', 'url'));
