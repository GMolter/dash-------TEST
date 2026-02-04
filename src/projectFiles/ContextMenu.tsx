import { useEffect, useRef } from 'react';

export type ContextMenuItem = {
  id: string;
  label: string;
  destructive?: boolean;
  onClick: () => void;
};

export function ContextMenu({
  open,
  x,
  y,
  items,
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (ref.current && !ref.current.contains(t)) onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        ref={ref}
        className="absolute min-w-[220px] rounded-2xl border border-slate-800/60 bg-slate-950/95 backdrop-blur shadow-2xl overflow-hidden"
        style={{ left: x, top: y }}
      >
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => it.onClick()}
            className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-900/55 transition-colors ${
              it.destructive ? 'text-rose-200' : 'text-slate-200'
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}
