import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export function NameModal({
  open,
  title,
  initialValue,
  placeholder,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue || '');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue || '');
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, initialValue]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button className="absolute inset-0 bg-black/55" onClick={onClose} aria-label="Close" />
      <div className="relative w-[560px] max-w-[92vw] rounded-3xl border border-slate-800/60 bg-slate-950/92 backdrop-blur p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="text-xl font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="p-2 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full px-4 py-3 rounded-2xl bg-slate-950/50 border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSubmit(value);
              }
              if (e.key === 'Escape') onClose();
            }}
          />
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-3 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(value)}
            disabled={!value.trim()}
            className={`px-4 py-3 rounded-2xl border transition-colors ${
              value.trim()
                ? 'bg-blue-500/20 border-blue-500/30 text-blue-200 hover:bg-blue-500/25'
                : 'bg-slate-900/20 border-slate-800/60 text-slate-500 cursor-not-allowed'
            }`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
