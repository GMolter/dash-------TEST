alter table public.profiles
add column if not exists app_admin boolean default null;

comment on column public.profiles.app_admin is
'App-level admin access flag. True grants app admin API access; null/false are non-admin.';
