-- Add responsive width controls to the per-user home dashboard layout.
alter table public.user_dashboard_modules
  add column if not exists column_span smallint not null default 12;

alter table public.user_dashboard_modules
  drop constraint if exists user_dashboard_modules_column_span_valid;

alter table public.user_dashboard_modules
  add constraint user_dashboard_modules_column_span_valid
  check (column_span in (4, 6, 8, 12));

