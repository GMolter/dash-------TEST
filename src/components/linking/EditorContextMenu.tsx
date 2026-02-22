import { useEffect } from 'react';
import { createPortal } from 'react-dom';

type EditorContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  canEdit: boolean;
  canRemove: boolean;
  onInsert: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onClose: () => void;
};

export function EditorContextMenu({
  open,
  x,
  y,
  canEdit,
  canRemove,
  onInsert,
  onEdit,
  onRemove,
  onClose,
}: EditorContextMenuProps) {
  useEffect(() => {
    if (!open) return;
    const onWindowClick = () => onClose();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('click', onWindowClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', onWindowClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const menuWidth = 176;
  const menuHeight = 124;
  const clampedX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
  const clampedY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));

  const menuButtonClass =
    'w-full text-left rounded-lg px-3 py-2 text-sm transition-colors hover:bg-slate-900/70 text-slate-200';
  const disabledClass = 'w-full text-left rounded-lg px-3 py-2 text-sm text-slate-500 cursor-not-allowed';

  return createPortal(
    <div
      className="fixed z-[80] w-44 rounded-xl border border-slate-700/70 bg-slate-950/98 p-1.5 shadow-2xl"
      style={{ left: clampedX, top: clampedY }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className={menuButtonClass}
        onClick={() => {
          onInsert();
          onClose();
        }}
      >
        Insert Link
      </button>
      <button
        className={canEdit ? menuButtonClass : disabledClass}
        onClick={() => {
          if (!canEdit) return;
          onEdit();
          onClose();
        }}
        disabled={!canEdit}
      >
        Edit Link
      </button>
      <button
        className={canRemove ? menuButtonClass : disabledClass}
        onClick={() => {
          if (!canRemove) return;
          onRemove();
          onClose();
        }}
        disabled={!canRemove}
      >
        Remove Link
      </button>
    </div>,
    document.body,
  );
}
