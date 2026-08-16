import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

const DISPLAY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

export const LAUNCHER_REQUEST_TTL_SECONDS = 600;
export const LAUNCHER_POLL_INTERVAL_SECONDS = 3;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isSecret(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

export function normalizeDeviceName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return null;
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 1 || normalized.length > 80) {
    return null;
  }
  return normalized;
}

export function normalizeDisplayCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/-/g, '');
  if (normalized.length !== 10) return null;
  for (const character of normalized) {
    if (!DISPLAY_ALPHABET.includes(character)) return null;
  }
  return normalized;
}

export function generateSecret(): string {
  return randomBytes(32).toString('hex');
}

export function generateDisplayCode(): string {
  let code = '';
  while (code.length < 10) {
    for (const value of randomBytes(16)) {
      if (value >= 248) continue;
      code += DISPLAY_ALPHABET[value % DISPLAY_ALPHABET.length];
      if (code.length === 10) break;
    }
  }
  return code;
}

export function formatDisplayCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export function generateRequestId(): string {
  return randomUUID();
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function asBytea(hash: string): string {
  return `\\x${hash}`;
}

function protectedActor(value: string, serverKey: string) {
  return asBytea(createHmac('sha256', serverKey).update(value, 'utf8').digest('hex'));
}

export function sourceActor(req: { headers?: Record<string, unknown>; socket?: { remoteAddress?: string } }, scope: string, serverKey: string) {
  const forwarded = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
  const remote = forwarded || req.socket?.remoteAddress || 'unknown';
  return protectedActor(`${scope}:${remote}`, serverKey);
}

export function userActor(userId: string, scope: string, serverKey: string) {
  return protectedActor(`${scope}:${userId}`, serverKey);
}

export function deviceActor(deviceId: string, scope: string, serverKey: string) {
  return protectedActor(`${scope}:${deviceId}`, serverKey);
}

export function safeState(value: unknown): string {
  const allowed = new Set([
    'waiting', 'approved', 'denied', 'expired', 'cancelled', 'connected',
    'disconnected', 'revoked', 'rate_limited', 'scope_required', 'too_large',
    'calendar_not_connected', 'offline', 'invalid',
  ]);
  return typeof value === 'string' && allowed.has(value) ? value : 'invalid';
}
