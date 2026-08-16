import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, RefreshCw, Unplug } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

type CalendarState = 'loading' | 'connected' | 'disconnected' | 'error';

export function GoogleCalendarConnection() {
  const { session } = useAuth();
  const [state, setState] = useState<CalendarState>('loading');
  const [connectedAt, setConnectedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const request = useCallback(async (action: string) => {
    if (!session?.access_token) throw new Error('Sign in again to manage calendar access.');
    const response = await fetch('/api/launcher', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action }),
    });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(
      data.state === 'not_configured'
        ? 'Google Calendar has not been configured by the Olio administrator yet.'
        : 'Google Calendar could not be reached. Try again.',
    );
    return data;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const data = await request('calendar-status');
      setState(data.state === 'connected' ? 'connected' : 'disconnected');
      setConnectedAt(typeof data.connected_at === 'string' ? data.connected_at : '');
      setMessage('');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Calendar status could not be loaded.');
    }
  }, [request, session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    setBusy(true);
    setMessage('');
    try {
      const data = await request('calendar-connect');
      const authorizationUrl = typeof data.authorization_url === 'string'
        ? new URL(data.authorization_url) : null;
      if (!authorizationUrl || authorizationUrl.protocol !== 'https:'
        || authorizationUrl.hostname !== 'accounts.google.com') {
        throw new Error('Olio returned an invalid Google authorization address.');
      }
      window.location.assign(authorizationUrl.toString());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Calendar connection could not start.');
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setMessage('');
    try {
      await request('calendar-disconnect');
      setState('disconnected');
      setConnectedAt('');
      setMessage('Google Calendar disconnected.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Calendar could not be disconnected.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-t border-slate-700 pt-6" aria-labelledby="google-calendar-heading">
      <h3 id="google-calendar-heading" className="flex items-center gap-2 text-lg font-semibold text-white">
        <CalendarDays className="h-5 w-5" /> Google Calendar
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        Give Olio read-only access to your primary calendar so the Launcher can show the rest of today’s schedule.
        The Launcher keeps only today’s schedule in a Windows-encrypted local cache and refreshes it about every two hours.
      </p>

      <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium text-white">
              {state === 'loading' ? 'Checking connection…'
                : state === 'connected' ? 'Calendar connected'
                : state === 'error' ? 'Connection unavailable'
                : 'Calendar not connected'}
            </div>
            {state === 'connected' && connectedAt && (
              <div className="mt-1 text-xs text-slate-400">
                Connected {new Date(connectedAt).toLocaleDateString()}
              </div>
            )}
          </div>

          {state === 'connected' ? (
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Unplug className="h-4 w-4" /> {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              disabled={busy || state === 'loading'}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ExternalLink className="h-4 w-4" /> {busy ? 'Opening Google…' : 'Connect calendar'}
            </button>
          )}
        </div>
        {message && <p className="mt-3 text-sm text-amber-300" role="status">{message}</p>}
        {state === 'error' && (
          <button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        )}
      </div>
    </section>
  );
}
