/*
  Read-only Google Calendar connection for Olio Launcher.

  Refresh tokens are encrypted by the server before storage. Browser and launcher
  roles receive no table privileges; only the service-only launcher endpoint can
  read the encrypted material. Connecting a calendar explicitly grants the
  calendar:read scope to that user's active launcher devices.
*/

create table public.google_calendar_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  token_ciphertext bytea not null,
  token_iv bytea not null,
  token_tag bytea not null,
  connected_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.google_calendar_connections enable row level security;
revoke all on table public.google_calendar_connections from public, anon, authenticated;

alter table public.launcher_devices
  drop constraint launcher_devices_scopes_milestone6;

alter table public.launcher_devices
  add constraint launcher_devices_scopes_calendar
  check (
    scopes = array['connection:status']::text[]
    or scopes = array['connection:status', 'quick-pastes:read']::text[]
    or scopes = array['connection:status', 'quick-pastes:read', 'calendar:read']::text[]
  );

create or replace function public.apply_launcher_calendar_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.google_calendar_connections
    where owner_id = new.owner_id
  ) then
    new.scopes := array['connection:status', 'quick-pastes:read', 'calendar:read']::text[];
  end if;
  return new;
end;
$$;

create trigger apply_launcher_calendar_scope_before_insert
before insert on public.launcher_devices
for each row execute function public.apply_launcher_calendar_scope();

create or replace function public.grant_launcher_calendar_scope(p_owner_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer := 0;
begin
  update public.launcher_devices
  set scopes = array['connection:status', 'quick-pastes:read', 'calendar:read']::text[]
  where owner_id = p_owner_id
    and revoked_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.revoke_launcher_calendar_scope(p_owner_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer := 0;
begin
  update public.launcher_devices
  set scopes = array['connection:status', 'quick-pastes:read']::text[]
  where owner_id = p_owner_id
    and revoked_at is null
    and scopes @> array['calendar:read']::text[];
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.fetch_launcher_calendar_credentials(
  p_device_identifier uuid,
  p_credential_hash bytea,
  p_source_actor_hash bytea,
  p_device_actor_hash bytea
)
returns table(
  outcome text,
  token_ciphertext bytea,
  token_iv bytea,
  token_tag bytea
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  device_row public.launcher_devices%rowtype;
  connection_row public.google_calendar_connections%rowtype;
begin
  if p_device_identifier is null
     or p_credential_hash is null or octet_length(p_credential_hash) <> 32
     or p_source_actor_hash is null or octet_length(p_source_actor_hash) <> 32
     or p_device_actor_hash is null or octet_length(p_device_actor_hash) <> 32 then
    return query select 'invalid'::text, null::bytea, null::bytea, null::bytea;
    return;
  end if;

  if not public.consume_launcher_rate_limit('calendar-source', p_source_actor_hash, 60, 600) then
    return query select 'rate_limited'::text, null::bytea, null::bytea, null::bytea;
    return;
  end if;

  select * into device_row
  from public.launcher_devices
  where device_identifier = p_device_identifier
    and credential_hash = p_credential_hash
    and revoked_at is null
  for update;

  if not found then
    return query select 'invalid'::text, null::bytea, null::bytea, null::bytea;
    return;
  end if;
  if not (device_row.scopes @> array['calendar:read']::text[]) then
    return query select 'scope_required'::text, null::bytea, null::bytea, null::bytea;
    return;
  end if;
  if not public.consume_launcher_rate_limit('calendar-device', p_device_actor_hash, 30, 600) then
    return query select 'rate_limited'::text, null::bytea, null::bytea, null::bytea;
    return;
  end if;

  select * into connection_row
  from public.google_calendar_connections
  where owner_id = device_row.owner_id;
  if not found then
    return query select 'calendar_not_connected'::text, null::bytea, null::bytea, null::bytea;
    return;
  end if;

  update public.launcher_devices set last_used_at = clock_timestamp()
  where id = device_row.id;
  return query select 'connected'::text, connection_row.token_ciphertext,
    connection_row.token_iv, connection_row.token_tag;
end;
$$;

revoke all on function public.grant_launcher_calendar_scope(uuid) from public, anon, authenticated;
revoke all on function public.apply_launcher_calendar_scope() from public, anon, authenticated;
revoke all on function public.revoke_launcher_calendar_scope(uuid) from public, anon, authenticated;
revoke all on function public.fetch_launcher_calendar_credentials(uuid, bytea, bytea, bytea)
  from public, anon, authenticated;
grant execute on function public.grant_launcher_calendar_scope(uuid) to service_role;
grant execute on function public.revoke_launcher_calendar_scope(uuid) to service_role;
grant execute on function public.fetch_launcher_calendar_credentials(uuid, bytea, bytea, bytea)
  to service_role;

comment on table public.google_calendar_connections is
  'Server-encrypted Google refresh tokens for read-only launcher schedule access.';
comment on function public.fetch_launcher_calendar_credentials(uuid, bytea, bytea, bytea) is
  'Validates a revocable calendar-scoped launcher and returns encrypted token material to the service role.';

notify pgrst, 'reload schema';
