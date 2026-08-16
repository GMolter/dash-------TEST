import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCalendarSchedule } from '../api/launcher.js';
import { encryptCalendarToken } from '../api/_utils/googleCalendar.js';

const originalFetch = globalThis.fetch;
const deviceId = 'aaaaaaaa-0000-4000-8000-000000000001';
const credential = 'a'.repeat(64);

function request() {
  return {
    body: {
      action: 'calendar-schedule',
      device_id: deviceId,
      credential,
      time_min: '2026-08-15T18:00:00.000Z',
      time_max: '2026-08-16T03:59:59.000Z',
    },
    headers: { 'x-forwarded-for': '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as VercelRequest;
}

function response() {
  const result = {
    statusCode: 0,
    body: {} as Record<string, unknown>,
    headers: new Map<string, unknown>(),
    setHeader: vi.fn((name: string, value: unknown) => {
      result.headers.set(name, value);
      return result;
    }),
    status: vi.fn((statusCode: number) => {
      result.statusCode = statusCode;
      return result;
    }),
    json: vi.fn((body: Record<string, unknown>) => {
      result.body = body;
      return result;
    }),
  };
  return result as unknown as VercelResponse & typeof result;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
  delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
});

describe('launcher Calendar schedule endpoint', () => {
  it('decrypts server-side credentials and returns only bounded event fields', async () => {
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = '22'.repeat(32);
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
    const encrypted = encryptCalendarToken('refresh-token')!;
    const client = {
      rpc: vi.fn(async () => ({ data: [{ outcome: 'connected', ...encrypted }], error: null })),
      auth: { getUser: vi.fn() },
    };
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [
          {
            id: 'event-1',
            summary: 'Planning session',
            location: 'Room 2',
            status: 'confirmed',
            start: { dateTime: '2026-08-15T20:00:00-04:00' },
            end: { dateTime: '2026-08-15T21:00:00-04:00' },
            description: 'must not leave Google boundary',
            attendees: [{ email: 'private@example.com' }],
          },
          {
            id: 'cancelled', status: 'cancelled', summary: 'Cancelled',
            start: { dateTime: '2026-08-15T22:00:00Z' },
            end: { dateTime: '2026-08-15T23:00:00Z' },
          },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const res = response();
    await handleCalendarSchedule(request(), res, client as never, 'server-key');

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      state: 'connected',
      items: [{
        id: 'event-1',
        title: 'Planning session',
        start_at: '2026-08-16T00:00:00.000Z',
        end_at: '2026-08-16T01:00:00.000Z',
        all_day: false,
        location: 'Room 2',
      }],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/refresh-token|access-token|description|attendees|email/);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(client.rpc).toHaveBeenCalledWith('fetch_launcher_calendar_credentials', expect.objectContaining({
      p_device_identifier: deviceId,
      p_credential_hash: expect.stringMatching(/^\\x[0-9a-f]{64}$/),
    }));
  });

  it.each([
    ['not connected', 'calendar_not_connected', 409],
    ['scope missing', 'scope_required', 403],
    ['rate limited', 'rate_limited', 429],
  ])('returns a content-free response when Calendar is %s', async (_name, state, status) => {
    const client = {
      rpc: vi.fn(async () => ({ data: [{ outcome: state }], error: null })),
      auth: { getUser: vi.fn() },
    };
    const res = response();
    await handleCalendarSchedule(request(), res, client as never, 'server-key');
    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({ state });
  });
});

