import { Clipboard, Grid2X2, QrCode } from 'lucide-react';

const shortcuts = [
  { label: 'QR Generator', tool: 'qr', icon: QrCode },
  { label: 'Quick Pastes', tool: 'quick-pastes', icon: Clipboard },
  { label: 'All Utilities', path: '/utilities', icon: Grid2X2 },
];

export function DashboardShortcuts({ onNavigate, onOpenTool }: { onNavigate: (path: string) => void; onOpenTool: (tool: string) => void }) {
  return (
    <section className="glass-panel rounded-[2rem] p-5 sm:p-6" aria-label="Utility shortcuts">
      <div className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Shortcuts</div>
      <div className="dashboard-shortcuts-grid grid gap-3 sm:grid-cols-3">
        {shortcuts.map((shortcut) => {
          const Icon = shortcut.icon;
          return <button key={shortcut.label} type="button" onClick={() => shortcut.path ? onNavigate(shortcut.path) : onOpenTool(shortcut.tool!)} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4 text-left text-sm font-medium text-slate-200 hover:border-indigo-300/25 hover:bg-white/[0.07]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-400/10"><Icon className="h-4 w-4 text-indigo-200" /></span>{shortcut.label}</button>;
        })}
      </div>
    </section>
  );
}
