import { useCallback, useEffect, useState } from 'react';
import { Check, Laptop, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

type AuthorizationState = 'loading' | 'waiting' | 'approved' | 'denied' | 'expired' | 'cancelled' | 'exchanged' | 'invalid' | 'rate_limited' | 'error';
type AuthorizationResponse = { state?: string; device_name?: string; expires_at?: string };
type AuthorizationFetch = (action: 'inspect' | 'approve' | 'deny', accessToken: string, requestId: string, displayCode: string) => Promise<AuthorizationResponse>;

async function fetchLauncherAuthorization(action: 'inspect' | 'approve' | 'deny', accessToken: string, requestId: string, displayCode: string) {
  const response = await fetch('/api/launcher', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action, request_id: requestId, display_code: displayCode }),
    cache: 'no-store',
  });
  const value = await response.json().catch(() => ({}));
  return value && typeof value === 'object' ? value as AuthorizationResponse : { state: 'error' };
}

function mapState(value: unknown): AuthorizationState {
  const states: AuthorizationState[] = ['waiting', 'approved', 'denied', 'expired', 'cancelled', 'exchanged', 'invalid', 'rate_limited'];
  return typeof value === 'string' && states.includes(value as AuthorizationState) ? value as AuthorizationState : 'error';
}

function closeBrowserTab() {
  window.close();
  return window.closed;
}

export function LauncherAuthorization({
  requestId,
  displayCode,
  authorize = fetchLauncherAuthorization,
  closeTab = closeBrowserTab,
  autoCloseSeconds = 8,
}: {
  requestId: string;
  displayCode: string;
  authorize?: AuthorizationFetch;
  closeTab?: () => boolean;
  autoCloseSeconds?: number;
}) {
  const { session } = useAuth();
  const [state, setState] = useState<AuthorizationState>('loading');
  const [deviceName, setDeviceName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [closeSeconds, setCloseSeconds] = useState<number | null>(null);
  const [autoCloseStopped, setAutoCloseStopped] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);

  const inspect = useCallback(async () => {
    if (!session?.access_token) return;
    setState('loading');
    try {
      const result = await authorize('inspect', session.access_token, requestId, displayCode);
      const next = mapState(result.state);
      setState(next);
      if (next === 'waiting') {
        setDeviceName(typeof result.device_name === 'string' ? result.device_name : 'Olio Launcher');
        setExpiresAt(typeof result.expires_at === 'string' ? result.expires_at : '');
      }
    } catch {
      setState('error');
    }
  }, [authorize, displayCode, requestId, session?.access_token]);

  useEffect(() => { void inspect(); }, [inspect]);

  useEffect(() => {
    if (state !== 'approved' && state !== 'denied') return;
    setCloseSeconds(autoCloseSeconds);
    setAutoCloseStopped(false);
    setCloseBlocked(false);
  }, [autoCloseSeconds, state]);

  useEffect(() => {
    if (closeSeconds === null || autoCloseStopped || closeBlocked) return;
    if (closeSeconds <= 0) {
      if (!closeTab()) setCloseBlocked(true);
      return;
    }
    const timer = window.setTimeout(() => {
      setCloseSeconds((current) => current === null ? null : current - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [autoCloseStopped, closeBlocked, closeSeconds, closeTab]);

  const decide = async (decision: 'approve' | 'deny') => {
    if (!session?.access_token || busy || state !== 'waiting') return;
    setBusy(true);
    try {
      const result = await authorize(decision, session.access_token, requestId, displayCode);
      setState(mapState(result.state));
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  };

  const expiry = expiresAt && !Number.isNaN(new Date(expiresAt).valueOf()) ? new Date(expiresAt).toLocaleString() : 'soon';
  const terminalCopy: Partial<Record<AuthorizationState, string>> = {
    approved: 'Approved. Return to Olio Launcher; it will finish the one-time connection.',
    denied: 'Denied. This launcher was not connected.',
    expired: 'This request expired. Start again from Olio Launcher Settings.',
    cancelled: 'This request was cancelled from the launcher.',
    exchanged: 'This request has already been used and cannot be replayed.',
    invalid: 'This authorization request is unavailable or no longer valid.',
    rate_limited: 'Too many attempts were made. Wait a few minutes, then start again from the launcher.',
  };

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-white">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-700 bg-slate-900/90 p-6 shadow-2xl sm:p-8">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-cyan-400/10 p-3"><Laptop className="h-7 w-7 text-cyan-300" /></div>
          <div><p className="text-sm text-cyan-300">Olio account security</p><h1 className="text-2xl font-semibold">Connect Olio Launcher</h1></div>
        </div>

        {state === 'loading' && <p className="mt-8 text-slate-300" role="status">Checking this authorization request…</p>}
        {state === 'error' && (
          <div className="mt-8 rounded-xl border border-red-700 bg-red-950/30 p-4" role="alert">
            <p>We couldn't check this request. Nothing was approved.</p>
            <button type="button" onClick={() => void inspect()} className="mt-3 rounded-lg bg-slate-700 px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Try again</button>
          </div>
        )}
        {state === 'waiting' && (
          <div className="mt-8 space-y-6">
            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-5">
              <p className="text-sm text-slate-400">Requesting device</p>
              <p className="mt-1 break-words text-xl font-medium">{deviceName}</p>
              <p className="mt-3 text-sm text-slate-400">Code <span className="font-mono font-semibold tracking-wider text-slate-100">{displayCode}</span></p>
              <p className="mt-1 text-sm text-slate-400">Expires {expiry}</p>
            </div>
            <div className="flex gap-3 text-sm text-slate-300"><ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-emerald-300" /><p>Approval creates one revocable device credential for connection status, read-only access to your private Quick Pastes, and—if you connected Google Calendar—today’s read-only schedule. The launcher cannot create, edit, delete, reorder, favorite, or share your data.</p></div>
            <p className="text-sm text-amber-200">Approve only if this device name and code match the launcher in front of you.</p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button type="button" disabled={busy} onClick={() => void decide('deny')} className="flex-1 rounded-lg border border-slate-600 px-4 py-3 font-medium hover:bg-slate-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><X className="mr-2 inline h-4 w-4" />Deny</button>
              <button type="button" disabled={busy} onClick={() => void decide('approve')} className="flex-1 rounded-lg bg-cyan-600 px-4 py-3 font-semibold hover:bg-cyan-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Check className="mr-2 inline h-4 w-4" />{busy ? 'Submitting…' : 'Approve launcher'}</button>
            </div>
          </div>
        )}
        {terminalCopy[state] && (
          <div className="mt-8 rounded-xl border border-slate-700 bg-slate-950/70 p-5" role="status">
            <p>{terminalCopy[state]}</p>
            {(state === 'approved' || state === 'denied') && (
              <div className="mt-4 border-t border-slate-700 pt-4 text-sm text-slate-300">
                {closeBlocked ? (
                  <p>Your browser kept this tab open. You can close it now.</p>
                ) : autoCloseStopped ? (
                  <p>Automatic closing stopped.</p>
                ) : (
                  <>
                    <p>This tab will close automatically in {closeSeconds ?? autoCloseSeconds} seconds.</p>
                    <button
                      type="button"
                      onClick={() => setAutoCloseStopped(true)}
                      className="mt-3 rounded-lg border border-slate-600 px-4 py-2 font-medium text-slate-100 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                    >
                      Keep this tab open
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
