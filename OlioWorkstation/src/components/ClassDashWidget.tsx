import { ArrowRight, Clock3, MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { buildClassInstances, ClassDashStatus } from '../features/classdash/model';
import { useClassDash } from '../hooks/useClassDash';

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatCountdown(milliseconds: number) {
  let seconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getStatus(now: Date, start: Date, leaveAt: Date): ClassDashStatus {
  if (now >= start) return 'in-class';
  if (now >= leaveAt) return 'leave-now';
  return 'waiting';
}

export function ClassDashWidget({ onOpen, full = false }: { onOpen: () => void; full?: boolean }) {
  const { installed, settings, meetings, loading, error } = useClassDash();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const instances = useMemo(
    () => settings ? buildClassInstances(now, meetings, settings) : [],
    [meetings, now, settings],
  );
  const next = instances.find((instance) => instance.end > now);

  if (loading) return <div className="glass-panel h-48 animate-pulse rounded-[2rem]" role="status" aria-label="Loading ClassDash" />;
  if (error) return <div className="glass-panel rounded-[2rem] border-rose-400/20 p-5 text-sm text-rose-100">{error}</div>;
  if (!installed) return null;

  if (!settings || meetings.length === 0) {
    return (
      <section className="glass-panel rounded-[2rem] p-6 sm:p-7">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200/80">ClassDash</div>
        <h2 className="mt-3 text-2xl font-semibold text-white">Build your class schedule</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">Pin your dorm and classrooms on the map. ClassDash will calculate a walking estimate and add a five-minute buffer.</p>
        <button type="button" onClick={onOpen} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-400">Set up ClassDash <ArrowRight className="h-4 w-4" /></button>
      </section>
    );
  }

  if (!next) {
    return (
      <section className="glass-panel rounded-[2rem] p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/80">ClassDash</div><h2 className="mt-3 text-2xl font-semibold text-white">You’re clear</h2><p className="mt-2 text-sm text-slate-400">Nothing is scheduled during the next week.</p></div>
          <button type="button" onClick={onOpen} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.06]">Open</button>
        </div>
      </section>
    );
  }

  const status = getStatus(now, next.start, next.leaveAt);
  const target = status === 'in-class' ? next.end : status === 'leave-now' ? next.start : next.leaveAt;
  const statusText = status === 'in-class' ? 'In class' : status === 'leave-now' ? 'Leave now' : `Leave by ${formatTime(next.leaveAt)}`;
  const countdownLabel = status === 'in-class' ? 'until class ends' : status === 'leave-now' ? 'until class starts' : 'until you should leave';

  if (!full) {
    return (
      <section className="glass-panel relative h-full overflow-hidden rounded-[1.6rem] p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-200/80">ClassDash · next class</div>
            <button type="button" onClick={onOpen} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white">Open <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>

          <div className="mt-3 flex min-h-0 flex-1 items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="truncate text-2xl font-semibold tracking-tight text-white sm:text-3xl">{next.meeting.code}</h2>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${status === 'leave-now' ? 'border-rose-300/35 bg-rose-400/15 text-rose-100' : status === 'in-class' ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100' : 'border-violet-300/35 bg-violet-400/15 text-violet-100'}`}>{statusText}</span>
              </div>
              {(next.meeting.title || next.meeting.section) && <p className="mt-1 max-w-xl truncate text-sm text-slate-400">{[next.meeting.title, next.meeting.section].filter(Boolean).join(' · ')}</p>}
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-3xl font-semibold tracking-[-0.06em] text-white sm:text-4xl">{formatCountdown(target.getTime() - now.getTime())}</div>
              <div className="mt-1 text-[11px] text-slate-500">{countdownLabel}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 border-t border-white/10 pt-3">
            <div className="flex min-w-0 items-center gap-2.5 rounded-xl bg-white/[0.035] px-3 py-2"><Clock3 className="h-4 w-4 shrink-0 text-violet-300" /><div className="min-w-0"><div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Leave at</div><div className="truncate text-sm font-medium text-slate-100">{formatTime(next.leaveAt)}</div></div></div>
            <div className="flex min-w-0 items-center gap-2.5 rounded-xl bg-white/[0.035] px-3 py-2"><MapPin className="h-4 w-4 shrink-0 text-violet-300" /><div className="min-w-0"><div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Going to</div><div className="truncate text-sm font-medium text-slate-100">{next.meeting.location_name}</div></div></div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-panel overflow-hidden rounded-[2rem] p-7 sm:p-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200/80">ClassDash · next class</div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{next.meeting.code}</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${status === 'leave-now' ? 'border-rose-300/35 bg-rose-400/15 text-rose-100' : status === 'in-class' ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100' : 'border-violet-300/35 bg-violet-400/15 text-violet-100'}`}>{statusText}</span>
          </div>
          {(next.meeting.title || next.meeting.section) && <p className="mt-1 text-sm text-slate-400">{[next.meeting.title, next.meeting.section].filter(Boolean).join(' · ')}</p>}
        </div>
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.06]">Open ClassDash <ArrowRight className="h-4 w-4" /></button>
      </div>

      <div className="mt-8 font-mono text-6xl font-semibold tracking-[-0.06em] text-white sm:text-8xl">{formatCountdown(target.getTime() - now.getTime())}</div>
      <p className="mt-2 text-sm text-slate-400">{countdownLabel}</p>

      <div className="classdash-meta mt-6 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2">
        <div className="flex items-center gap-3"><Clock3 className="h-4 w-4 text-violet-300" /><div><div className="text-[11px] uppercase tracking-wider text-slate-500">Leave at</div><div className="mt-1 text-sm text-slate-200">{formatTime(next.leaveAt)}</div></div></div>
        <div className="flex items-center gap-3"><MapPin className="h-4 w-4 text-violet-300" /><div><div className="text-[11px] uppercase tracking-wider text-slate-500">Going to</div><div className="mt-1 text-sm text-slate-200">{next.meeting.location_name}</div></div></div>
      </div>
      {next.tightConnection && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-400/[0.08] px-3 py-2 text-xs text-amber-100">Tight connection: the walk and buffer are longer than the {next.gapMinutes}-minute gap after {next.previousMeeting?.code}.</div>}
    </section>
  );
}
