import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceConfig } from './_utils/supabaseConfig.js';
import {
  calendarAccessToken,
  calendarAuthorizationUrl,
  calendarOAuthConfigured,
  decryptCalendarToken,
  encryptCalendarToken,
  exchangeCalendarCode,
  verifyCalendarOAuthState,
} from './_utils/googleCalendar.js';
import {
  asBytea,
  deviceActor,
  formatDisplayCode,
  generateDisplayCode,
  generateRequestId,
  generateSecret,
  isSecret,
  isUuid,
  normalizeDeviceName,
  normalizeDisplayCode,
  safeState,
  sha256,
  sourceActor,
  userActor,
} from './_utils/launcherProtocol.js';

type ServiceClient = {
  rpc: (name: string, arguments_?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  auth: {
    getUser: (accessToken: string) => Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
};

type LauncherQuickPaste = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  sort_order: number;
  is_favorite: boolean;
};

type LauncherCalendarEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  ongoing: boolean;
  location: string;
};

export const LAUNCHER_QUICK_PASTE_LIMITS = {
  items: 100,
  titleCharacters: 120,
  contentCharacters: 20_000,
  categoryCharacters: 60,
  aggregateContentCharacters: 500_000,
  responseBytes: 1_048_576,
} as const;

function firstRow(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || !value[0] || typeof value[0] !== 'object') return null;
  return value[0] as Record<string, unknown>;
}

function characterLength(value: string) {
  return Array.from(value).length;
}

function validQuickPasteText(value: unknown, maximum: number, requireNonblank: boolean): value is string {
  return typeof value === 'string'
    && !value.includes('\0')
    && characterLength(value) <= maximum
    && (!requireNonblank || value.trim().length > 0);
}

export function validateLauncherQuickPasteItems(value: unknown): LauncherQuickPaste[] | null {
  if (!Array.isArray(value) || value.length > LAUNCHER_QUICK_PASTE_LIMITS.items) return null;
  const ids = new Set<string>();
  const items: LauncherQuickPaste[] = [];
  let aggregateContentCharacters = 0;
  let priorSortOrder = -1;

  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const item = candidate as Record<string, unknown>;
    const category = item.category;
    if (!isUuid(item.id)
      || ids.has(item.id)
      || !validQuickPasteText(item.title, LAUNCHER_QUICK_PASTE_LIMITS.titleCharacters, true)
      || !validQuickPasteText(item.content, LAUNCHER_QUICK_PASTE_LIMITS.contentCharacters, true)
      || !(category === null
        || validQuickPasteText(category, LAUNCHER_QUICK_PASTE_LIMITS.categoryCharacters, true))
      || !Number.isSafeInteger(item.sort_order)
      || Number(item.sort_order) < 0
      || Number(item.sort_order) < priorSortOrder
      || typeof item.is_favorite !== 'boolean') {
      return null;
    }

    aggregateContentCharacters += characterLength(item.content);
    if (aggregateContentCharacters > LAUNCHER_QUICK_PASTE_LIMITS.aggregateContentCharacters) {
      return null;
    }
    ids.add(item.id);
    priorSortOrder = Number(item.sort_order);
    items.push({
      id: item.id,
      title: item.title,
      content: item.content,
      category: category === null ? null : String(category),
      sort_order: Number(item.sort_order),
      is_favorite: item.is_favorite,
    });
  }
  return items;
}

function send(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}

function sendBoundedQuickPastes(
  res: VercelResponse,
  body: { state: 'connected'; synchronized_at: string; items: LauncherQuickPaste[] },
) {
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > LAUNCHER_QUICK_PASTE_LIMITS.responseBytes) {
    return send(res, 413, { state: 'too_large' });
  }
  return send(res, 200, body);
}

function bodyOf(req: VercelRequest): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
}

function bearer(req: VercelRequest): string | null {
  const raw = String(req.headers.authorization ?? '');
  return raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() || null : null;
}

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function profileRedirect(status: 'connected' | 'error') {
  try {
    const configured = new URL(process.env.GOOGLE_CALENDAR_REDIRECT_URI || '');
    return `${configured.origin}/profile?calendar=${status}`;
  } catch {
    return `/profile?calendar=${status}`;
  }
}

async function authenticatedUser(req: VercelRequest, client: ServiceClient): Promise<string | null> {
  const token = bearer(req);
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

async function handleCreate(req: VercelRequest, res: VercelResponse, client: ServiceClient, actorKey: string) {
  const body = bodyOf(req);
  const deviceId = body.device_id;
  const deviceName = normalizeDeviceName(body.device_name);
  const pairingSecret = body.pairing_secret;
  if (!isUuid(deviceId) || !deviceName || !isSecret(pairingSecret)) {
    return send(res, 400, { state: 'invalid' });
  }

  const requestId = generateRequestId();
  const displayCode = generateDisplayCode();
  const { data, error } = await client.rpc('create_launcher_pairing', {
    p_request_id: requestId,
    p_device_identifier: deviceId,
    p_device_name: deviceName,
    p_pairing_secret_hash: asBytea(sha256(pairingSecret)),
    p_approval_code_hash: asBytea(sha256(displayCode)),
    p_actor_hash: sourceActor(req, 'create', actorKey),
  });
  const result = !error ? firstRow(data) : null;
  const state = safeState(result?.outcome);
  if (!result || state !== 'waiting') return send(res, state === 'rate_limited' ? 429 : 400, { state });
  return send(res, 200, {
    state: 'waiting',
    request_id: result.created_request_id,
    display_code: formatDisplayCode(displayCode),
    expires_at: result.created_expires_at,
    poll_interval: 3,
  });
}

async function handlePoll(req: VercelRequest, res: VercelResponse, client: ServiceClient, actorKey: string) {
  const body = bodyOf(req);
  if (!isUuid(body.request_id) || !isUuid(body.device_id) || !isSecret(body.pairing_secret)) {
    return send(res, 400, { state: 'invalid' });
  }
  const { data, error } = await client.rpc('poll_launcher_pairing', {
    p_request_id: body.request_id,
    p_device_identifier: body.device_id,
    p_pairing_secret_hash: asBytea(sha256(body.pairing_secret)),
    p_actor_hash: sourceActor(req, 'poll', actorKey),
  });
  const state = safeState(error ? 'invalid' : data);
  return send(res, state === 'rate_limited' ? 429 : 200, { state });
}

async function handleExchange(req: VercelRequest, res: VercelResponse, client: ServiceClient, actorKey: string) {
  const body = bodyOf(req);
  if (!isUuid(body.request_id) || !isUuid(body.device_id) || !isSecret(body.pairing_secret)) {
    return send(res, 400, { state: 'invalid' });
  }
  const credential = generateSecret();
  const deviceRecordId = generateRequestId();
  const { data, error } = await client.rpc('exchange_launcher_pairing', {
    p_request_id: body.request_id,
    p_device_identifier: body.device_id,
    p_pairing_secret_hash: asBytea(sha256(body.pairing_secret)),
    p_credential_hash: asBytea(sha256(credential)),
    p_device_record_id: deviceRecordId,
    p_actor_hash: sourceActor(req, 'exchange', actorKey),
  });
  const result = !error ? firstRow(data) : null;
  if (!result || safeState(result.outcome) !== 'connected') return send(res, 400, { state: 'invalid' });
  return send(res, 200, {
    state: 'connected',
    credential,
    device_record_id: result.connected_device_id,
    device_name: result.connected_device_name,
  });
}

async function handleCancel(req: VercelRequest, res: VercelResponse, client: ServiceClient) {
  const body = bodyOf(req);
  if (!isUuid(body.request_id) || !isUuid(body.device_id) || !isSecret(body.pairing_secret)) {
    return send(res, 400, { state: 'invalid' });
  }
  const { data, error } = await client.rpc('cancel_launcher_pairing', {
    p_request_id: body.request_id,
    p_device_identifier: body.device_id,
    p_pairing_secret_hash: asBytea(sha256(body.pairing_secret)),
  });
  return send(res, 200, { state: safeState(error ? 'invalid' : data) });
}

async function handleDeviceStatus(req: VercelRequest, res: VercelResponse, client: ServiceClient, actorKey: string) {
  const body = bodyOf(req);
  if (!isUuid(body.device_id) || !isSecret(body.credential)) {
    return send(res, 400, { state: 'invalid' });
  }
  const { data, error } = await client.rpc('validate_launcher_device', {
    p_device_identifier: body.device_id,
    p_credential_hash: asBytea(sha256(body.credential)),
    p_actor_hash: sourceActor(req, 'device-status', actorKey),
  });
  const result = !error ? firstRow(data) : null;
  const state = safeState(result?.outcome);
  if (!result || state !== 'connected') return send(res, state === 'rate_limited' ? 429 : 401, { state });
  return send(res, 200, {
    state,
    device_name: result.connected_device_name,
    connected_at: result.connected_at,
    last_used_at: result.last_used_at,
  });
}

export async function handleQuickPastes(
  req: VercelRequest,
  res: VercelResponse,
  client: ServiceClient,
  actorKey: string,
) {
  const body = bodyOf(req);
  if (!isUuid(body.device_id) || !isSecret(body.credential)) {
    return send(res, 400, { state: 'invalid' });
  }

  const { data, error } = await client.rpc('fetch_launcher_quick_pastes', {
    p_device_identifier: body.device_id,
    p_credential_hash: asBytea(sha256(body.credential)),
    p_source_actor_hash: sourceActor(req, 'quick-pastes-source', actorKey),
    p_device_actor_hash: deviceActor(body.device_id, 'quick-pastes-device', actorKey),
  });
  const result = !error ? firstRow(data) : null;
  const state = safeState(result?.outcome);
  if (!result || state !== 'connected') {
    if (state === 'rate_limited') return send(res, 429, { state });
    if (state === 'scope_required') return send(res, 403, { state });
    if (state === 'too_large') return send(res, 413, { state });
    return send(res, 401, { state: 'invalid' });
  }

  const items = validateLauncherQuickPasteItems(result.quick_paste_items);
  const synchronizedAt = result.synchronized_at;
  if (!items
    || typeof synchronizedAt !== 'string'
    || synchronizedAt.length > 40
    || Number.isNaN(new Date(synchronizedAt).valueOf())) {
    return send(res, 502, { state: 'invalid' });
  }
  return sendBoundedQuickPastes(res, {
    state: 'connected',
    synchronized_at: synchronizedAt,
    items,
  });
}

async function handleDisconnect(req: VercelRequest, res: VercelResponse, client: ServiceClient) {
  const body = bodyOf(req);
  if (!isUuid(body.device_id) || !isSecret(body.credential)) {
    return send(res, 400, { state: 'invalid' });
  }
  const { data, error } = await client.rpc('disconnect_launcher_device', {
    p_device_identifier: body.device_id,
    p_credential_hash: asBytea(sha256(body.credential)),
  });
  return send(res, 200, { state: safeState(error ? 'invalid' : data) });
}

async function handleAuthorization(req: VercelRequest, res: VercelResponse, client: ServiceClient, action: string, actorKey: string) {
  const userId = await authenticatedUser(req, client);
  if (!userId) return send(res, 401, { state: 'unauthenticated' });
  const body = bodyOf(req);
  const code = normalizeDisplayCode(body.display_code);
  if (!isUuid(body.request_id) || !code) return send(res, 400, { state: 'invalid' });
  const actor = userActor(userId, action === 'inspect' ? 'inspect' : 'decision', actorKey);
  if (action === 'inspect') {
    const { data, error } = await client.rpc('inspect_launcher_pairing', {
      p_request_id: body.request_id,
      p_approval_code_hash: asBytea(sha256(code)),
      p_actor_hash: actor,
    });
    const result = !error ? firstRow(data) : null;
    const state = safeState(result?.outcome);
    if (!result || state !== 'waiting') return send(res, state === 'rate_limited' ? 429 : 400, { state });
    return send(res, 200, {
      state,
      device_name: result.safe_device_name,
      expires_at: result.request_expires_at,
    });
  }
  const { data, error } = await client.rpc('decide_launcher_pairing', {
    p_request_id: body.request_id,
    p_approval_code_hash: asBytea(sha256(code)),
    p_owner_id: userId,
    p_decision: action,
    p_actor_hash: actor,
  });
  const state = safeState(error ? 'invalid' : data);
  return send(res, state === 'rate_limited' ? 429 : 200, { state });
}

async function handleCalendarOAuthCallback(req: VercelRequest, res: VercelResponse, client: ServiceClient) {
  const code = queryValue(req.query.code);
  const userId = verifyCalendarOAuthState(queryValue(req.query.state));
  if (!code || !userId || !calendarOAuthConfigured()) {
    return res.redirect(302, profileRedirect('error'));
  }
  const refreshToken = await exchangeCalendarCode(code);
  const encrypted = refreshToken ? encryptCalendarToken(refreshToken) : null;
  if (!encrypted) return res.redirect(302, profileRedirect('error'));
  const service = client as any;
  const { error } = await service.from('google_calendar_connections').upsert({
    owner_id: userId,
    ...encrypted,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_id' });
  if (error) return res.redirect(302, profileRedirect('error'));
  const granted = await client.rpc('grant_launcher_calendar_scope', { p_owner_id: userId });
  return res.redirect(302, profileRedirect(granted.error ? 'error' : 'connected'));
}

async function handleCalendarAccount(
  req: VercelRequest,
  res: VercelResponse,
  client: ServiceClient,
  action: 'calendar-status' | 'calendar-connect' | 'calendar-disconnect',
) {
  const userId = await authenticatedUser(req, client);
  if (!userId) return send(res, 401, { state: 'unauthenticated' });
  const service = client as any;
  if (action === 'calendar-connect') {
    const authorization_url = calendarAuthorizationUrl(userId);
    return authorization_url
      ? send(res, 200, { state: 'ready', authorization_url })
      : send(res, 503, { state: 'not_configured' });
  }
  if (action === 'calendar-disconnect') {
    const { error } = await service.from('google_calendar_connections').delete().eq('owner_id', userId);
    if (error) return send(res, 503, { state: 'offline' });
    await client.rpc('revoke_launcher_calendar_scope', { p_owner_id: userId });
    return send(res, 200, { state: 'disconnected' });
  }
  const { data, error } = await service.from('google_calendar_connections')
    .select('connected_at').eq('owner_id', userId).maybeSingle();
  if (error) return send(res, 503, { state: 'offline' });
  return send(res, 200, data
    ? { state: 'connected', connected_at: data.connected_at }
    : { state: 'disconnected' });
}

function boundedDate(value: unknown) {
  if (typeof value !== 'string' || value.length > 40) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.valueOf()) ? null : timestamp;
}

function normalizeCalendarEvent(candidate: unknown, now: Date): LauncherCalendarEvent | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const event = candidate as Record<string, any>;
  const startValue = event.start?.dateTime || (event.start?.date ? `${event.start.date}T00:00:00Z` : '');
  const endValue = event.end?.dateTime || (event.end?.date ? `${event.end.date}T00:00:00Z` : '');
  const start = boundedDate(startValue);
  const end = boundedDate(endValue);
  if (!start || !end || typeof event.id !== 'string' || !event.id || event.id.length > 256) return null;
  const title = typeof event.summary === 'string' && event.summary.trim()
    ? event.summary.trim().slice(0, 160) : '(Untitled event)';
  const location = typeof event.location === 'string' ? event.location.trim().slice(0, 160) : '';
  return {
    id: event.id,
    title,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    all_day: Boolean(event.start?.date && !event.start?.dateTime),
    ongoing: start <= now && end > now,
    location,
  };
}

export async function handleCalendarSchedule(
  req: VercelRequest,
  res: VercelResponse,
  client: ServiceClient,
  actorKey: string,
) {
  const body = bodyOf(req);
  const timeMin = boundedDate(body.time_min);
  const timeMax = boundedDate(body.time_max);
  if (!isUuid(body.device_id) || !isSecret(body.credential) || !timeMin || !timeMax
    || timeMax <= timeMin || timeMax.valueOf() - timeMin.valueOf() > 36 * 60 * 60 * 1000) {
    return send(res, 400, { state: 'invalid' });
  }
  const { data, error } = await client.rpc('fetch_launcher_calendar_credentials', {
    p_device_identifier: body.device_id,
    p_credential_hash: asBytea(sha256(body.credential)),
    p_source_actor_hash: sourceActor(req, 'calendar-source', actorKey),
    p_device_actor_hash: deviceActor(body.device_id, 'calendar-device', actorKey),
  });
  const result = !error ? firstRow(data) : null;
  const state = safeState(result?.outcome);
  if (!result || state !== 'connected') {
    if (state === 'rate_limited') return send(res, 429, { state });
    if (state === 'scope_required') return send(res, 403, { state });
    if (state === 'calendar_not_connected') return send(res, 409, { state });
    return send(res, 401, { state: 'invalid' });
  }
  const refreshToken = decryptCalendarToken(result.token_ciphertext, result.token_iv, result.token_tag);
  const accessToken = refreshToken ? await calendarAccessToken(refreshToken) : null;
  if (!accessToken) return send(res, 502, { state: 'calendar_reconnect_required' });

  const query = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
    fields: 'items(id,summary,start,end,location,status)',
  });
  const googleResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!googleResponse.ok) return send(res, 502, { state: 'calendar_unavailable' });
  const google = await googleResponse.json() as Record<string, unknown>;
  const rawItems = Array.isArray(google.items) ? google.items : [];
  const now = new Date();
  const items = rawItems
    .filter((item) => (item as Record<string, unknown>)?.status !== 'cancelled')
    .map((item) => normalizeCalendarEvent(item, now))
    .filter((item): item is LauncherCalendarEvent => Boolean(item));
  return send(res, 200, { state: 'connected', synchronized_at: now.toISOString(), items });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const config = getSupabaseServiceConfig();
  if (config.ok === false) return send(res, 503, { state: 'offline' });
  const client = createClient(config.url, config.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as ServiceClient;
  if (req.method === 'GET' && queryValue(req.query.oauth) === 'google-calendar') {
    try {
      return await handleCalendarOAuthCallback(req, res, client);
    } catch {
      return res.redirect(302, profileRedirect('error'));
    }
  }
  if (req.method !== 'POST') return send(res, 405, { state: 'invalid' });
  const action = String(bodyOf(req).action ?? '');
  try {
    switch (action) {
      case 'create': return await handleCreate(req, res, client, config.serviceKey);
      case 'poll': return await handlePoll(req, res, client, config.serviceKey);
      case 'exchange': return await handleExchange(req, res, client, config.serviceKey);
      case 'cancel': return await handleCancel(req, res, client);
      case 'device-status': return await handleDeviceStatus(req, res, client, config.serviceKey);
      case 'quick-pastes': return await handleQuickPastes(req, res, client, config.serviceKey);
      case 'calendar-schedule': return await handleCalendarSchedule(req, res, client, config.serviceKey);
      case 'calendar-status':
      case 'calendar-connect':
      case 'calendar-disconnect': return await handleCalendarAccount(req, res, client, action);
      case 'disconnect': return await handleDisconnect(req, res, client);
      case 'inspect':
      case 'approve':
      case 'deny': return await handleAuthorization(req, res, client, action, config.serviceKey);
      default: return send(res, 400, { state: 'invalid' });
    }
  } catch {
    return send(res, 503, { state: 'offline' });
  }
}
