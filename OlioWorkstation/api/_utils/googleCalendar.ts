import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString('base64url');
}

function stateSecret() {
  return process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.CALENDAR_TOKEN_ENCRYPTION_KEY || '';
}

function encryptionKey() {
  const raw = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY || '';
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}

function signature(payload: string) {
  const secret = stateSecret();
  return secret ? base64Url(createHmac('sha256', secret).update(payload).digest()) : '';
}

export function calendarOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID
      && process.env.GOOGLE_CALENDAR_CLIENT_SECRET
      && process.env.GOOGLE_CALENDAR_REDIRECT_URI
      && stateSecret()
      && encryptionKey(),
  );
}

export function createCalendarOAuthState(userId: string) {
  const payload = base64Url(JSON.stringify({
    v: 1,
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
    nonce: randomBytes(18).toString('hex'),
  }));
  return `${payload}.${signature(payload)}`;
}

export function verifyCalendarOAuthState(state: string): string | null {
  const [payload, received, extra] = state.split('.');
  if (!payload || !received || extra) return null;
  const expected = signature(payload);
  if (!expected || received.length !== expected.length
    || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (parsed.v !== 1 || typeof parsed.sub !== 'string' || typeof parsed.exp !== 'number'
      || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed.sub;
  } catch {
    return null;
  }
}

export function calendarAuthorizationUrl(userId: string) {
  if (!calendarOAuthConfigured()) return null;
  const query = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_CALENDAR_REDIRECT_URI!,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: createCalendarOAuthState(userId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
}

export async function exchangeCalendarCode(code: string) {
  if (!calendarOAuthConfigured()) return null;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_CALENDAR_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) return null;
  const value = await response.json() as Record<string, unknown>;
  return typeof value.refresh_token === 'string' && value.refresh_token
    ? value.refresh_token : null;
}

export function encryptCalendarToken(token: string) {
  const key = encryptionKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    token_ciphertext: `\\x${encrypted.toString('hex')}`,
    token_iv: `\\x${iv.toString('hex')}`,
    token_tag: `\\x${cipher.getAuthTag().toString('hex')}`,
  };
}

function bytea(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.startsWith('\\x') ? value.slice(2) : value;
  return /^[0-9a-f]+$/i.test(normalized) && normalized.length % 2 === 0
    ? Buffer.from(normalized, 'hex') : null;
}

export function decryptCalendarToken(ciphertext: unknown, ivValue: unknown, tagValue: unknown) {
  const key = encryptionKey();
  const encrypted = bytea(ciphertext);
  const iv = bytea(ivValue);
  const tag = bytea(tagValue);
  if (!key || !encrypted || !iv || iv.length !== 12 || !tag || tag.length !== 16) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export async function calendarAccessToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) return null;
  const value = await response.json() as Record<string, unknown>;
  return typeof value.access_token === 'string' ? value.access_token : null;
}

