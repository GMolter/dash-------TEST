-- Per-user freeform positions for dashboard plugins, quick links, and shortcuts.
create table if not exists public.user_dashboard_layout_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  x smallint not null default 0,
  y smallint not null default 0,
  width smallint not null default 3,
  height smallint not null default 2,
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id),
  constraint user_dashboard_layout_item_id_not_blank check (char_length(btrim(item_id)) > 0),
  constraint user_dashboard_layout_x_valid check (x between 0 and 11),
  constraint user_dashboard_layout_y_valid check (y between 0 and 500),
  constraint user_dashboard_layout_width_valid check (width between 1 and 12),
  constraint user_dashboard_layout_height_valid check (height between 1 and 20),
  constraint user_dashboard_layout_bounds_valid check (x + width <= 12)
);

alter table public.user_dashboard_layout_items enable row level security;

create policy "user_dashboard_layout_items_select_own" on public.user_dashboard_layout_items
  for select to authenticated using (auth.uid() = user_id);
create policy "user_dashboard_layout_items_insert_own" on public.user_dashboard_layout_items
  for insert to authenticated with check (auth.uid() = user_id);
create policy "user_dashboard_layout_items_update_own" on public.user_dashboard_layout_items
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_dashboard_layout_items_delete_own" on public.user_dashboard_layout_items
  for delete to authenticated using (auth.uid() = user_id);

create index if not exists idx_user_dashboard_layout_items_user_position
  on public.user_dashboard_layout_items(user_id, y, x);
