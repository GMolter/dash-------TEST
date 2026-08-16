import { useEffect, useRef, useState } from 'react';
import { Laptop, RefreshCw, Trash2, X } from 'lucide-react';
import type { LauncherDeviceRepository } from '../features/launcherDevices/repository';
import { useLauncherDevices } from '../hooks/useLauncherDevices';

function safeDate(value: string | null) {
  if (!value) return 'Not used yet';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Unavailable' : date.toLocaleString();
}

export function LauncherDevices({ repository }: { repository?: LauncherDeviceRepository }) {
  const state = useLauncherDevices(repository);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const selected = state.devices.find((device) => device.id === confirmId) ?? null;

  useEffect(() => {
    if (!selected) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  return (
    <section className="border-t border-slate-700 pt-6" aria-labelledby="launcher-devices-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="launcher-devices-heading" className="flex items-center gap-2 text-lg font-semibold text-white">
          <Laptop className="h-5 w-5" /> Olio Launcher devices
        </h3>
        <button
          type="button"
          onClick={() => void state.reload()}
          disabled={state.loading}
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <RefreshCw className="mr-2 inline h-4 w-4" /> Refresh
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Remove a launcher to revoke its access immediately. Connected launchers can read your private Quick Pastes and, when enabled, today’s Google Calendar schedule, but cannot manage or share them.
      </p>

      {state.loading && <div className="mt-4 text-sm text-slate-300" role="status">Loading launcher devices…</div>}
      {state.error && (
        <div className="mt-4 rounded-lg border border-red-700 bg-red-950/30 p-4 text-sm text-red-200" role="alert">
          {state.error}
          <button type="button" onClick={() => void state.reload()} className="ml-3 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Try again</button>
        </div>
      )}
      {state.success && <div className="mt-4 text-sm text-emerald-300" role="status">{state.success}</div>}
      {!state.loading && !state.error && state.devices.length === 0 && (
        <div className="mt-4 rounded-lg bg-slate-900/50 p-4 text-sm text-slate-300">
          No Olio Launcher devices are connected.
        </div>
      )}
      {!state.loading && state.devices.length > 0 && (
        <ul className="mt-4 space-y-3" aria-label="Your Olio Launcher devices">
          {state.devices.map((device) => (
            <li key={device.id} className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="break-words font-medium text-white">{device.device_name}</div>
                  <dl className="mt-2 grid gap-1 text-xs text-slate-400">
                    <div><dt className="inline font-medium text-slate-300">Connected:</dt> <dd className="inline">{safeDate(device.connected_at)}</dd></div>
                    <div><dt className="inline font-medium text-slate-300">Last used:</dt> <dd className="inline">{safeDate(device.last_used_at)}</dd></div>
                  </dl>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmId(device.id)}
                  disabled={state.busyId === device.id}
                  className="rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-5" role="presentation">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6" role="alertdialog" aria-modal="true" aria-labelledby="remove-launcher-title" aria-describedby="remove-launcher-description">
            <div className="flex items-start justify-between gap-3">
              <h4 id="remove-launcher-title" className="text-xl font-semibold text-white">Remove this launcher?</h4>
              <button type="button" aria-label="Close removal confirmation" onClick={() => setConfirmId(null)} className="rounded p-1 text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><X className="h-5 w-5" /></button>
            </div>
            <p id="remove-launcher-description" className="mt-3 break-words text-sm text-slate-300">
              {selected.device_name} will immediately lose its Olio connection. You can connect it again later from the launcher.
            </p>
            <div className="mt-6 flex gap-3">
              <button ref={cancelRef} type="button" onClick={() => setConfirmId(null)} className="flex-1 rounded-lg bg-slate-700 px-4 py-2 text-white hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Cancel</button>
              <button
                type="button"
                disabled={state.busyId === selected.id}
                onClick={async () => { if (await state.revoke(selected.id)) setConfirmId(null); }}
                className="flex-1 rounded-lg bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <Trash2 className="mr-2 inline h-4 w-4" /> Remove launcher
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
