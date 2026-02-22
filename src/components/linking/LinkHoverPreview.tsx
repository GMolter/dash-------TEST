type LinkHoverPreviewProps = {
  visible: boolean;
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  warning?: string;
  actionHint?: string;
};

export function LinkHoverPreview({
  visible,
  x,
  y,
  title,
  subtitle,
  warning,
  actionHint,
}: LinkHoverPreviewProps) {
  if (!visible) return null;

  return (
    <div
      className="fixed z-[70] w-[300px] max-w-[85vw] rounded-2xl border border-slate-700/70 bg-slate-950/95 px-3 py-2.5 shadow-2xl backdrop-blur"
      style={{ left: x + 14, top: y + 14 }}
    >
      <div className="text-sm font-medium text-slate-100 truncate">{title}</div>
      {subtitle ? <div className="mt-0.5 text-xs text-slate-300">{subtitle}</div> : null}
      {warning ? (
        <div className="mt-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          {warning}
        </div>
      ) : null}
      {actionHint ? <div className="mt-2 text-[11px] text-blue-200">{actionHint}</div> : null}
    </div>
  );
}
