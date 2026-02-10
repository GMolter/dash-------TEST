create table if not exists public.app_settings (
  id text primary key,
  banner_enabled boolean not null default false,
  banner_text text not null default '',
  help_docs text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id)
values ('global')
on conflict (id) do nothing;
