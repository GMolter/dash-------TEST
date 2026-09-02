-- Per-user workstation plugins, dashboard layout, and ClassDash schedules.

create table if not exists public.user_plugin_installations (
  user_id uuid not null references auth.users(id) on delete cascade,
  plugin_id text not null,
  dashboard_enabled boolean not null default true,
  dashboard_order integer not null default 0,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, plugin_id),
  constraint user_plugin_installations_plugin_id_not_blank check (char_length(btrim(plugin_id)) > 0)
);

create table if not exists public.user_dashboard_modules (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null,
  enabled boolean not null default true,
  order_index integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id),
  constraint user_dashboard_modules_module_id_not_blank check (char_length(btrim(module_id)) > 0)
);

create table if not exists public.classdash_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dorm_name text not null,
  dorm_lat double precision not null,
  dorm_lng double precision not null,
  walking_speed_kph numeric(4,2) not null default 4.8,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classdash_settings_dorm_name_not_blank check (char_length(btrim(dorm_name)) > 0),
  constraint classdash_settings_latitude check (dorm_lat between -90 and 90),
  constraint classdash_settings_longitude check (dorm_lng between -180 and 180),
  constraint classdash_settings_walking_speed check (walking_speed_kph between 1 and 10)
);

create table if not exists public.classdash_classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  title text not null default '',
  section text not null default '',
  days smallint[] not null,
  start_time time not null,
  end_time time not null,
  location_name text not null,
  location_lat double precision not null,
  location_lng double precision not null,
  term_start date,
  term_end date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classdash_classes_code_not_blank check (char_length(btrim(code)) > 0),
  constraint classdash_classes_location_not_blank check (char_length(btrim(location_name)) > 0),
  constraint classdash_classes_days_present check (cardinality(days) > 0),
  constraint classdash_classes_days_valid check (days <@ array[0,1,2,3,4,5,6]::smallint[]),
  constraint classdash_classes_times_valid check (end_time > start_time),
  constraint classdash_classes_latitude check (location_lat between -90 and 90),
  constraint classdash_classes_longitude check (location_lng between -180 and 180),
  constraint classdash_classes_term_valid check (term_start is null or term_end is null or term_end >= term_start)
);

alter table public.user_plugin_installations enable row level security;
alter table public.user_dashboard_modules enable row level security;
alter table public.classdash_settings enable row level security;
alter table public.classdash_classes enable row level security;

create policy "user_plugin_installations_select_own" on public.user_plugin_installations
  for select to authenticated using (auth.uid() = user_id);
create policy "user_plugin_installations_insert_own" on public.user_plugin_installations
  for insert to authenticated with check (auth.uid() = user_id);
create policy "user_plugin_installations_update_own" on public.user_plugin_installations
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_plugin_installations_delete_own" on public.user_plugin_installations
  for delete to authenticated using (auth.uid() = user_id);

create policy "user_dashboard_modules_select_own" on public.user_dashboard_modules
  for select to authenticated using (auth.uid() = user_id);
create policy "user_dashboard_modules_insert_own" on public.user_dashboard_modules
  for insert to authenticated with check (auth.uid() = user_id);
create policy "user_dashboard_modules_update_own" on public.user_dashboard_modules
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_dashboard_modules_delete_own" on public.user_dashboard_modules
  for delete to authenticated using (auth.uid() = user_id);

create policy "classdash_settings_select_own" on public.classdash_settings
  for select to authenticated using (auth.uid() = user_id);
create policy "classdash_settings_insert_own" on public.classdash_settings
  for insert to authenticated with check (auth.uid() = user_id);
create policy "classdash_settings_update_own" on public.classdash_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "classdash_settings_delete_own" on public.classdash_settings
  for delete to authenticated using (auth.uid() = user_id);

create policy "classdash_classes_select_own" on public.classdash_classes
  for select to authenticated using (auth.uid() = user_id);
create policy "classdash_classes_insert_own" on public.classdash_classes
  for insert to authenticated with check (auth.uid() = user_id);
create policy "classdash_classes_update_own" on public.classdash_classes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "classdash_classes_delete_own" on public.classdash_classes
  for delete to authenticated using (auth.uid() = user_id);

create index if not exists idx_user_dashboard_modules_order
  on public.user_dashboard_modules(user_id, order_index);
create index if not exists idx_classdash_classes_user_order
  on public.classdash_classes(user_id, sort_order, start_time);

