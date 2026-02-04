import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';
import type { FileNode } from './store';
import { updateNode } from './store';

export function DocEditor({
  projectId: _projectId,
  doc,
  onTitleChange,
  onContentChange,
  onSaved,
}: {
  projectId: string;
  doc: FileNode;
  onTitleChange: (name: string) => void;
  onContentChange: (content: string) => void;
  onSaved?: () => void;
}) {
  const [title, setTitle] = useState(doc.name);
  const [content, setContent] = useState(doc.content || '');
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<number | null>(null);
  const lastSavedRef = useRef<string>(content);

  useEffect(() => {
    setTitle(doc.name);
    setContent(doc.content || '');
    lastSavedRef.current = doc.content || '';
    setSaved(true);
  }, [doc.id]);

  // Debounced autosave to Supabase
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);

    if (content === lastSavedRef.current) {
      setSaved(true);
      return;
    }

    setSaved(false);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await updateNode(doc.id, { content });
        lastSavedRef.current = content;
        setSaved(true);
        onContentChange(content);
        onSaved?.();
      } catch {
        setSaved(false);
      }
    }, 450);

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [content, doc.id]);

  const status = useMemo(() => (saved ? 'Saved' : 'Saving…'), [saved]);

  return (
    <div className="rounded-3xl border border-slate-800/60 bg-slate-950/80 p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-slate-200">
            <FileText className="w-4 h-4" />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const t = title.trim();
                if (t && t !== doc.name) onTitleChange(t);
              }}
              className="w-full bg-transparent text-lg font-semibold focus:outline-none"
            />
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              {status}
            </span>
          </div>
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write here…"
        className="mt-5 w-full min-h-[420px] rounded-3xl bg-slate-950/60 border border-slate-800/60 px-5 py-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35 resize-none"
      />
    </div>
  );
}
