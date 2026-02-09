alter table public.app_settings
add column if not exists help_docs text not null default '';
