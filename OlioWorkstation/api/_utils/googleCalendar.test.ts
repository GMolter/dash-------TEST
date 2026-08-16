import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  calendarAuthorizationUrl,
  createCalendarOAuthState,
  decryptCalendarToken,
  encryptCalendarToken,
  verifyCalendarOAuthState,
} from './googleCalendar';

const keys = [
  'CALENDAR_TOKEN_ENCRYPTION_KEY',
  'GOOGLE_OAUTH_STATE_SECRET',
  'GOOGLE_CALENDAR_CLIENT_ID',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
  'GOOGLE_CALENDAR_REDIRECT_URI',
] as const;
const previous = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of keys) previous.set(key, process.env[key]);
  process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = '11'.repeat(32);
  process.env.GOOGLE_OAUTH_STATE_SECRET = 'test-state-secret-with-enough-entropy';
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client.apps.googleusercontent.com';
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
  process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'https://olio.example/api/launcher?oauth=google-calendar';
});

afterEach(() => {
  for (const key of keys) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('Google Calendar credential boundary', () => {
  it('round-trips refresh tokens with authenticated encryption', () => {
    const encrypted = encryptCalendarToken('refresh-token-value');
    expect(encrypted).not.toBeNull();
    expect(encrypted?.token_ciphertext).not.toContain('refresh-token-value');
    expect(decryptCalendarToken(
      encrypted?.token_ciphertext,
      encrypted?.token_iv,
      encrypted?.token_tag,
    )).toBe('refresh-token-value');
  });

  it('signs user-bound OAuth state and rejects tampering', () => {
    const state = createCalendarOAuthState('11111111-1111-4111-8111-111111111111');
    expect(verifyCalendarOAuthState(state)).toBe('11111111-1111-4111-8111-111111111111');
    expect(verifyCalendarOAuthState(`${state.slice(0, -1)}x`)).toBeNull();
  });

  it('requests only read-only Calendar access with offline consent', () => {
    const url = new URL(calendarAuthorizationUrl('user-id')!);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.readonly');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });
});

