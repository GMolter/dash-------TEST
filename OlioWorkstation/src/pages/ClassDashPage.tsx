import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, GraduationCap, MapPin, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { ClassDashWidget } from '../components/ClassDashWidget';
import { MapLocationPicker } from '../components/MapLocationPicker';
import { ExtractedClassMeeting, SyllabusImporter } from '../components/SyllabusImporter';
import { DAY_LABELS, DEFAULT_WALKING_SPEED_KPH } from '../features/classdash/model';
import { CLASSDASH_PLUGIN_ID } from '../features/plugins/catalog';
import { useClassDash } from '../hooks/useClassDash';
import { useDashboardConfiguration } from '../hooks/useDashboardConfiguration';

type MeetingForm = {
  id?: string;
  code: string;
  title: string;
  section: string;
  days: number[];
  start_time: string;
  end_time: string;
  location_name: string;
  location_lat: number | null;
  location_lng: number | null;
  term_start: string;
  term_end: string;
};

const EMPTY_MEETING: MeetingForm = {
  code: '',
  title: '',
  section: '',
  days: [1, 3],
  start_time: '09:00',
  end_time: '10:15',
  location_name: '',
  location_lat: null,
  location_lng: null,
  term_start: '',
  term_end: '',
};

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

export function ClassDashPage() {
  const { installed, settings, meetings, loading, syncing, error, saveSettings, saveMeeting, deleteMeeting } = useClassDash();
  const { installPlugin } = useDashboardConfiguration();
  const [dormName, setDormName] = useState('');
  const [dormCoordinates, setDormCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [showHomeEditor, setShowHomeEditor] = useState(false);
  const [meetingForm, setMeetingForm] = useState<MeetingForm>(EMPTY_MEETING);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    if (!settings) return;
    setDormName(settings.dorm_name);
    setDormCoordinates({ lat: settings.dorm_lat, lng: settings.dorm_lng });
  }, [settings]);

  const meetingLocation = useMemo(() => (
    meetingForm.location_lat === null || meetingForm.location_lng === null
      ? null
      : { lat: meetingForm.location_lat, lng: meetingForm.location_lng }
  ), [meetingForm.location_lat, meetingForm.location_lng]);

  const saveDorm = async (event: FormEvent) => {
    event.preventDefault();
    setSavedMessage('');
    if (!dormName.trim() || !dormCoordinates) {
      setFormError('Name your dorm or home and place its pin on the map.');
      return;
    }
    setFormError('');
    const saved = await saveSettings({
      dorm_name: dormName.trim(),
      dorm_lat: dormCoordinates.lat,
      dorm_lng: dormCoordinates.lng,
      walking_speed_kph: DEFAULT_WALKING_SPEED_KPH,
    });
    if (saved) {
      setSavedMessage('Home location saved. All leave times have been recalculated.');
      setShowHomeEditor(false);
    }
  };

  const submitMeeting = async (event: FormEvent) => {
    event.preventDefault();
    setSavedMessage('');
    if (!meetingForm.code.trim() || !meetingForm.location_name.trim() || !meetingLocation) {
      setFormError('Add a class code, name the class location, and place its map pin.');
      return;
    }
    if (meetingForm.days.length === 0) {
      setFormError('Choose at least one meeting day.');
      return;
    }
    if (meetingForm.end_time <= meetingForm.start_time) {
      setFormError('The class end time must be after its start time.');
      return;
    }
    if (meetingForm.term_start && meetingForm.term_end && meetingForm.term_end < meetingForm.term_start) {
      setFormError('The semester end date must be on or after its start date.');
      return;
    }
    setFormError('');
    const saved = await saveMeeting({
      id: meetingForm.id,
      code: meetingForm.code,
      title: meetingForm.title,
      section: meetingForm.section,
      days: meetingForm.days,
      start_time: meetingForm.start_time,
      end_time: meetingForm.end_time,
      location_name: meetingForm.location_name,
      location_lat: meetingLocation.lat,
      location_lng: meetingLocation.lng,
      term_start: meetingForm.term_start || null,
      term_end: meetingForm.term_end || null,
    });
    if (saved) {
      setSavedMessage(meetingForm.id ? 'Class updated.' : 'Class added to your schedule.');
      setMeetingForm(EMPTY_MEETING);
      setShowMeetingForm(false);
    }
  };

  const startEditing = (id: string) => {
    const meeting = meetings.find((candidate) => candidate.id === id);
    if (!meeting) return;
    setMeetingForm({
      id: meeting.id,
      code: meeting.code,
      title: meeting.title,
      section: meeting.section,
      days: meeting.days,
      start_time: normalizeTime(meeting.start_time),
      end_time: normalizeTime(meeting.end_time),
      location_name: meeting.location_name,
      location_lat: meeting.location_lat,
      location_lng: meeting.location_lng,
      term_start: meeting.term_start || '',
      term_end: meeting.term_end || '',
    });
    setShowMeetingForm(true);
    setFormError('');
    window.setTimeout(() => document.getElementById('class-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const reviewImportedMeeting = (meeting: ExtractedClassMeeting) => {
    setMeetingForm({
      code: meeting.code,
      title: meeting.title,
      section: meeting.section,
      days: meeting.days,
      start_time: meeting.start_time,
      end_time: meeting.end_time,
      location_name: meeting.location_name,
      location_lat: null,
      location_lng: null,
      term_start: meeting.term_start,
      term_end: meeting.term_end,
    });
    setShowMeetingForm(true);
    setFormError('');
    setSavedMessage('Imported as a draft. Check the details and place the classroom pin before saving.');
    window.setTimeout(() => document.getElementById('class-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  if (loading) return <div className="mx-auto max-w-6xl"><div className="glass-panel h-72 animate-pulse rounded-[2rem]" /></div>;

  if (!installed) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="glass-panel rounded-[2rem] p-8 text-center sm:p-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-400/10"><GraduationCap className="h-8 w-8 text-violet-200" /></div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white">ClassDash</h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">Install the ClassDash plugin to create your personal schedule, pin campus locations, and know exactly when to leave home.</p>
          <button type="button" onClick={() => void installPlugin(CLASSDASH_PLUGIN_ID)} className="mt-7 rounded-xl bg-violet-500 px-5 py-3 font-semibold text-white hover:bg-violet-400">Install ClassDash</button>
          {error && <p className="mt-4 text-sm text-rose-200">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7 pb-16">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-200/80">Installed plugin</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">ClassDash</h1>
        <p className="mt-2 text-slate-400">Your schedule and map locations are private to your Olio account.</p>
      </header>

      <ClassDashWidget full onOpen={() => document.getElementById('class-editor')?.scrollIntoView({ behavior: 'smooth' })} />

      {(error || formError || savedMessage) && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${error || formError ? 'border-rose-400/25 bg-rose-400/10 text-rose-100' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100'}`} role="status">
          {error || formError || savedMessage}
        </div>
      )}

      {settings && !showHomeEditor ? (
        <section className="glass-panel rounded-[1.6rem] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-300/15 bg-violet-400/10"><MapPin className="h-5 w-5 text-violet-200" /></span>
              <div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Home base</div><div className="mt-0.5 truncate font-semibold text-white">{settings.dorm_name}</div></div>
            </div>
            <button type="button" onClick={() => setShowHomeEditor(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3.5 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.08] hover:text-white"><Pencil className="h-4 w-4" /> Edit home</button>
          </div>
        </section>
      ) : (
        <form onSubmit={saveDorm} className="glass-panel rounded-[2rem] p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><div className="flex items-center gap-2 text-lg font-semibold text-white"><MapPin className="h-5 w-5 text-violet-300" /> Home base</div><p className="mt-1 max-w-3xl text-sm text-slate-400">Trips start here for your first class and whenever the previous class ended more than 45 minutes ago. Shorter gaps use the previous classroom. Walking uses an average 12.5 min/km pace plus a five-minute buffer.</p></div>
            <div className="flex items-center gap-2">{settings && <button type="button" onClick={() => { setDormName(settings.dorm_name); setDormCoordinates({ lat: settings.dorm_lat, lng: settings.dorm_lng }); setShowHomeEditor(false); }} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06]">Cancel</button>}<button type="submit" disabled={syncing} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-60"><Save className="h-4 w-4" /> Save home</button></div>
          </div>
          <div className="mt-6">
            <label className="text-sm text-slate-300">Dorm or home name<input value={dormName} onChange={(event) => setDormName(event.target.value)} placeholder="Teter Quad" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-violet-300/40" /></label>
          </div>
          <div className="mt-6"><MapLocationPicker key={settings ? `${settings.dorm_lat}-${settings.dorm_lng}` : 'new-home'} label="Place your dorm or home pin" value={dormCoordinates} onChange={setDormCoordinates} onPlaceSelected={(place) => { if (!dormName.trim()) setDormName(place); }} /></div>
        </form>
      )}

      <section id="class-editor" className="glass-panel scroll-mt-28 rounded-[2rem] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex items-center gap-2 text-lg font-semibold text-white"><CalendarDays className="h-5 w-5 text-violet-300" /> Weekly schedule</div><p className="mt-1 text-sm text-slate-400">Add each class once and select every day it meets.</p></div>
          <button type="button" onClick={() => { setMeetingForm(EMPTY_MEETING); setShowMeetingForm(true); setFormError(''); }} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-400"><Plus className="h-4 w-4" /> Add class</button>
        </div>

        <SyllabusImporter onReview={reviewImportedMeeting} />

        {meetings.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/15 px-5 py-10 text-center text-sm text-slate-400">No classes yet. Add your first class to start the countdown.</div>
        ) : (
          <div className="mt-6 space-y-3">
            {meetings.map((meeting) => (
              <article key={meeting.id} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><div className="font-semibold text-white">{meeting.code}{meeting.section && <span className="font-normal text-slate-400"> · {meeting.section}</span>}</div>{meeting.title && <div className="mt-1 text-sm text-slate-400">{meeting.title}</div>}<div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400"><span>{meeting.days.map((day) => DAY_LABELS[day]).join(', ')}</span><span>{normalizeTime(meeting.start_time)}–{normalizeTime(meeting.end_time)}</span><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{meeting.location_name}</span></div></div>
                  <div className="flex gap-2"><button type="button" onClick={() => startEditing(meeting.id)} className="rounded-xl border border-white/10 p-2.5 text-slate-300 hover:bg-white/[0.07]" aria-label={`Edit ${meeting.code}`}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => { if (window.confirm(`Delete ${meeting.code} from your schedule?`)) void deleteMeeting(meeting.id); }} className="rounded-xl border border-rose-400/15 bg-rose-400/[0.07] p-2.5 text-rose-200 hover:bg-rose-400/15" aria-label={`Delete ${meeting.code}`}><Trash2 className="h-4 w-4" /></button></div>
                </div>
              </article>
            ))}
          </div>
        )}

        {showMeetingForm && (
          <form onSubmit={submitMeeting} className="mt-6 rounded-[1.6rem] border border-violet-300/20 bg-violet-500/[0.06] p-5 sm:p-6">
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-white">{meetingForm.id ? 'Edit class' : 'Add a class'}</h2><button type="button" onClick={() => setShowMeetingForm(false)} className="rounded-xl p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white" aria-label="Close class editor"><X className="h-5 w-5" /></button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm text-slate-300">Course code<input required value={meetingForm.code} onChange={(event) => setMeetingForm((current) => ({ ...current, code: event.target.value }))} placeholder="INFO-I101" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-violet-300/40" /></label>
              <label className="text-sm text-slate-300">Course name<input value={meetingForm.title} onChange={(event) => setMeetingForm((current) => ({ ...current, title: event.target.value }))} placeholder="Introduction to Informatics" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-violet-300/40" /></label>
              <label className="text-sm text-slate-300">Section<input value={meetingForm.section} onChange={(event) => setMeetingForm((current) => ({ ...current, section: event.target.value }))} placeholder="Lecture or Lab" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-violet-300/40" /></label>
              <label className="text-sm text-slate-300">Starts<input required type="time" value={meetingForm.start_time} onChange={(event) => setMeetingForm((current) => ({ ...current, start_time: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-violet-300/40" /></label>
              <label className="text-sm text-slate-300">Ends<input required type="time" value={meetingForm.end_time} onChange={(event) => setMeetingForm((current) => ({ ...current, end_time: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-violet-300/40" /></label>
              <label className="text-sm text-slate-300">Building or location<input required value={meetingForm.location_name} onChange={(event) => setMeetingForm((current) => ({ ...current, location_name: event.target.value }))} placeholder="Luddy Hall 0117" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-violet-300/40" /></label>
            </div>
            <fieldset className="mt-5"><legend className="text-sm text-slate-300">Meeting days</legend><div className="mt-2 flex flex-wrap gap-2">{DAY_LABELS.map((day, index) => { const selected = meetingForm.days.includes(index); return <button key={day} type="button" onClick={() => setMeetingForm((current) => ({ ...current, days: selected ? current.days.filter((value) => value !== index) : [...current.days, index] }))} className={`rounded-xl border px-3 py-2 text-sm ${selected ? 'border-violet-300/35 bg-violet-400/15 text-violet-100' : 'border-white/10 bg-slate-950/40 text-slate-400'}`} aria-pressed={selected}>{selected && <Check className="mr-1 inline h-3.5 w-3.5" />}{day}</button>; })}</div></fieldset>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Semester starts <span className="text-slate-500">(optional)</span><input type="date" value={meetingForm.term_start} onChange={(event) => setMeetingForm((current) => ({ ...current, term_start: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-violet-300/40" /></label><label className="text-sm text-slate-300">Semester ends <span className="text-slate-500">(optional)</span><input type="date" value={meetingForm.term_end} onChange={(event) => setMeetingForm((current) => ({ ...current, term_end: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-violet-300/40" /></label></div>
            <div className="mt-6"><MapLocationPicker key={meetingForm.id || 'new-class'} label="Place the classroom pin" value={meetingLocation} onChange={(coordinates) => setMeetingForm((current) => ({ ...current, location_lat: coordinates.lat, location_lng: coordinates.lng }))} onPlaceSelected={(place) => setMeetingForm((current) => ({ ...current, location_name: current.location_name.trim() ? current.location_name : place }))} /></div>
            <div className="mt-6 flex justify-end"><button type="submit" disabled={syncing} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-60"><Save className="h-4 w-4" /> {meetingForm.id ? 'Save changes' : 'Add to schedule'}</button></div>
          </form>
        )}
      </section>
    </div>
  );
}
