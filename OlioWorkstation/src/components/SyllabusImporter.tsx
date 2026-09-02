import { ChangeEvent, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt'];
const FALLBACK_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain', md: 'text/markdown', rtf: 'application/rtf', odt: 'application/vnd.oasis.opendocument.text',
};

export type ExtractedClassMeeting = {
  code: string;
  title: string;
  section: string;
  days: number[];
  start_time: string;
  end_time: string;
  location_name: string;
  term_start: string;
  term_end: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read that file.'));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export function SyllabusImporter({ onReview }: { onReview: (meeting: ExtractedClassMeeting) => void }) {
  const { session } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');
  const [meetings, setMeetings] = useState<ExtractedClassMeeting[]>([]);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] || null;
    setError('');
    setMeetings([]);
    if (!next) {
      setFile(null);
      return;
    }
    const extension = next.name.split('.').pop()?.toLowerCase() || '';
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError('Use a PDF, Word document, RTF, ODT, Markdown, or text file.');
      event.target.value = '';
      return;
    }
    if (next.size > MAX_FILE_BYTES) {
      setError('That syllabus is over 3 MB. Compress it or save a smaller PDF first.');
      event.target.value = '';
      return;
    }
    setFile(next);
  };

  const extract = async () => {
    if (!file || extracting) return;
    if (!session?.access_token) {
      setError('Sign in again before importing a syllabus.');
      return;
    }
    setExtracting(true);
    setError('');
    setMeetings([]);
    try {
      const rawFileData = await fileToDataUrl(file);
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      const fileData = rawFileData.startsWith('data:;')
        ? rawFileData.replace('data:;', `data:${FALLBACK_MIME_TYPES[extension] || 'application/octet-stream'};`)
        : rawFileData;
      const response = await fetch('/api/planner/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ mode: 'classdash-syllabus', fileName: file.name, fileData }),
      });
      const rawText = await response.text();
      const result = (() => {
        try { return rawText ? JSON.parse(rawText) : {}; } catch { return {}; }
      })();
      if (!response.ok) throw new Error(result?.error || result?.detail || 'The syllabus could not be analyzed.');
      const extracted = Array.isArray(result?.meetings) ? result.meetings as ExtractedClassMeeting[] : [];
      if (!extracted.length) throw new Error('No recurring class meeting times were found.');
      setMeetings(extracted);
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : 'The syllabus could not be analyzed.');
    } finally {
      setExtracting(false);
    }
  };

  const clear = () => {
    setFile(null);
    setMeetings([]);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="mt-6 rounded-[1.6rem] border border-indigo-300/15 bg-indigo-400/[0.055] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 font-semibold text-white"><Sparkles className="h-4 w-4 text-indigo-300" /> Import from a syllabus</div>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">Upload a syllabus and ClassDash will find the course name and recurring meeting times. You review every result and place its map pin before it is saved.</p>
        </div>
        {file && <button type="button" onClick={clear} className="rounded-xl p-2 text-slate-400 hover:bg-white/[0.07] hover:text-white" aria-label="Clear syllabus"><X className="h-4 w-4" /></button>}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 bg-slate-950/35 px-4 py-3 text-sm text-slate-300 hover:border-indigo-300/30 hover:bg-slate-950/55">
          {file ? <FileText className="h-5 w-5 shrink-0 text-indigo-300" /> : <Upload className="h-5 w-5 shrink-0 text-slate-500" />}
          <span className="min-w-0 truncate">{file ? file.name : 'Choose a syllabus (PDF, Word, or text)'}</span>
          <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.rtf,.odt" onChange={chooseFile} className="sr-only" />
        </label>
        <button type="button" onClick={() => void extract()} disabled={!file || extracting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-45">
          {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {extracting ? 'Reading syllabus…' : 'Extract classes'}
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">Maximum 3 MB. When you click Extract, the document is sent securely to OpenAI for analysis; it is not added to your Olio files.</p>

      {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-3 py-2.5 text-sm text-rose-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {meetings.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Found {meetings.length} meeting {meetings.length === 1 ? 'time' : 'times'}</div>
          {meetings.map((meeting, index) => (
            <div key={`${meeting.code}-${meeting.start_time}-${index}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-white">{meeting.code || meeting.title || 'Imported class'}{meeting.section && <span className="font-normal text-slate-400"> · {meeting.section}</span>}</div>
                <div className="mt-1 text-xs text-slate-400">{meeting.days.map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]).join(', ')} · {meeting.start_time}–{meeting.end_time}{meeting.location_name ? ` · ${meeting.location_name}` : ''}</div>
                {meeting.notes && <div className="mt-1 text-xs text-amber-200/80">{meeting.notes}</div>}
              </div>
              <button type="button" onClick={() => onReview(meeting)} className="rounded-xl border border-indigo-300/25 bg-indigo-400/10 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-400/20">Review & place pin</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
