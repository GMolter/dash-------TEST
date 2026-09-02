import { PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, EyeOff, GripVertical, LayoutGrid, Plus, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { DashboardModuleId, DashboardModuleSpan } from '../features/plugins/catalog';
import { useDashboardConfiguration } from '../hooks/useDashboardConfiguration';
import { ClassDashWidget } from './ClassDashWidget';
import { DashboardShortcuts } from './DashboardShortcuts';
import { DashboardTodosHomeHeader } from './DashboardTodos';
import { Quicklinks } from './Quicklinks';

const SPAN_CLASSES: Record<DashboardModuleSpan, string> = {
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
  8: 'lg:col-span-8',
  12: 'lg:col-span-12',
};

const SIZES: Array<{ span: DashboardModuleSpan; label: string }> = [
  { span: 4, label: 'Small' },
  { span: 6, label: 'Half' },
  { span: 8, label: 'Wide' },
  { span: 12, label: 'Full' },
];

function nearestSpan(value: number): DashboardModuleSpan {
  return [4, 6, 8, 12].reduce((nearest, span) => Math.abs(span - value) < Math.abs(nearest - value) ? span : nearest, 4) as DashboardModuleSpan;
}

export function DashboardCanvas({
  editing,
  onEditingChange,
  onNavigate,
  onOpenTool,
}: {
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onNavigate: (path: string) => void;
  onOpenTool: (tool: string) => void;
}) {
  const { modules, loading, syncing, error, updateModule, reorderModules, updateModuleSpan, resetLayout } = useDashboardConfiguration();
  const [draggingId, setDraggingId] = useState<DashboardModuleId | null>(null);
  const [widgetTrayOpen, setWidgetTrayOpen] = useState(false);
  const [previewSpans, setPreviewSpans] = useState<Partial<Record<DashboardModuleId, DashboardModuleSpan>>>({});
  const gridRef = useRef<HTMLDivElement>(null);

  const contentModules = useMemo(() => modules.filter((module) => module.available && module.id !== 'tasks'), [modules]);
  const visibleModules = useMemo(() => contentModules.filter((module) => module.enabled), [contentModules]);
  const hiddenModules = useMemo(() => modules.filter((module) => module.id !== 'tasks' && (!module.enabled || !module.available)), [modules]);
  const tasksModule = modules.find((module) => module.id === 'tasks');

  const finishEditing = () => {
    setWidgetTrayOpen(false);
    onEditingChange(false);
  };

  const dropModule = (targetId: DashboardModuleId) => {
    if (!draggingId || draggingId === targetId) return;
    const visibleIds = visibleModules.map((module) => module.id);
    const fromIndex = visibleIds.indexOf(draggingId);
    const toIndex = visibleIds.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = visibleIds.splice(fromIndex, 1);
    visibleIds.splice(toIndex, 0, moved);
    const hiddenAvailableIds = contentModules.filter((module) => !module.enabled).map((module) => module.id);
    setDraggingId(null);
    void reorderModules([...visibleIds, ...hiddenAvailableIds]);
  };

  const moveVisibleModule = (moduleId: DashboardModuleId, direction: 'up' | 'down') => {
    const visibleIds = visibleModules.map((module) => module.id);
    const index = visibleIds.indexOf(moduleId);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= visibleIds.length) return;
    [visibleIds[index], visibleIds[swapIndex]] = [visibleIds[swapIndex], visibleIds[index]];
    const hiddenAvailableIds = contentModules.filter((module) => !module.enabled).map((module) => module.id);
    void reorderModules([...visibleIds, ...hiddenAvailableIds]);
  };

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>, moduleId: DashboardModuleId, currentSpan: DashboardModuleSpan) => {
    event.preventDefault();
    event.stopPropagation();
    const grid = gridRef.current;
    if (!grid || window.innerWidth < 1024) return;
    const startX = event.clientX;
    const columnWidth = grid.getBoundingClientRect().width / 12;
    let nextSpan = currentSpan;
    const move = (moveEvent: PointerEvent) => {
      nextSpan = nearestSpan(currentSpan + (moveEvent.clientX - startX) / columnWidth);
      setPreviewSpans((current) => ({ ...current, [moduleId]: nextSpan }));
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      setPreviewSpans((current) => {
        const next = { ...current };
        delete next[moduleId];
        return next;
      });
      if (nextSpan !== currentSpan) void updateModuleSpan(moduleId, nextSpan);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  };

  const renderModule = (moduleId: DashboardModuleId) => {
    if (moduleId === 'classdash') return <ClassDashWidget onOpen={() => onNavigate('/classdash')} />;
    if (moduleId === 'quicklinks') return <section aria-label="Quick Links"><Quicklinks editMode={false} /></section>;
    if (moduleId === 'shortcuts') return <DashboardShortcuts onNavigate={onNavigate} onOpenTool={onOpenTool} />;
    return null;
  };

  return (
    <>
      {tasksModule?.enabled && tasksModule.available && <DashboardTodosHomeHeader />}

      {editing && (
        <div className="sticky top-4 z-50 mt-7 rounded-2xl border border-indigo-300/25 bg-slate-950/90 p-3 shadow-2xl shadow-slate-950/50 backdrop-blur-2xl sm:flex sm:items-center sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3 px-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white"><LayoutGrid className="h-4 w-4" /></span>
            <div className="min-w-0"><div className="text-sm font-semibold text-white">Editing your dashboard</div><div className="truncate text-xs text-slate-400">Drag cards or pull their lower-right corners to resize.</div></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 sm:mt-0">
            <button type="button" onClick={() => setWidgetTrayOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.1]"><Plus className="h-3.5 w-3.5" /> Add widgets</button>
            <button type="button" disabled={syncing} onClick={() => void resetLayout()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.06] disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
            <button type="button" onClick={finishEditing} className="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-400">Done</button>
          </div>
        </div>
      )}

      {editing && widgetTrayOpen && (
        <div className="relative z-40 mt-3 rounded-2xl border border-white/10 bg-slate-950/80 p-4 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-white">Widgets</div><div className="text-xs text-slate-400">Restore hidden items or manage plugin widgets.</div></div><button type="button" onClick={() => setWidgetTrayOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white" aria-label="Close widgets tray"><X className="h-4 w-4" /></button></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {hiddenModules.map((module) => (
              <div key={module.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] p-3">
                <div className="min-w-0 flex-1"><div className="text-sm font-medium text-white">{module.name}</div><div className="truncate text-xs text-slate-500">{module.available ? 'Hidden' : 'Plugin not installed'}</div></div>
                {module.available
                  ? <button type="button" disabled={syncing} onClick={() => void updateModule(module.id, true)} className="rounded-lg bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/30">Add</button>
                  : <button type="button" onClick={() => onNavigate('/utilities/plugins')} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/[0.06]">Install</button>}
              </div>
            ))}
            {tasksModule && (
              <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] p-3">
                <div className="min-w-0 flex-1"><div className="text-sm font-medium text-white">My Tasks button</div><div className="truncate text-xs text-slate-500">Floating control</div></div>
                <button type="button" disabled={syncing} onClick={() => void updateModule('tasks', !tasksModule.enabled)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/[0.06]">{tasksModule.enabled ? 'Hide' : 'Show'}</button>
              </div>
            )}
          </div>
          {hiddenModules.length === 0 && !tasksModule && <div className="mt-4 text-sm text-slate-500">All widgets are already visible.</div>}
        </div>
      )}

      {error && editing && <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-100">{error}</div>}

      <div ref={gridRef} className={`mt-7 grid grid-cols-1 gap-6 sm:mt-8 lg:grid-cols-12 ${editing ? 'rounded-[2rem] border border-dashed border-indigo-300/20 bg-indigo-400/[0.025] p-3 sm:p-4' : ''}`}>
        {loading && <div className="h-52 animate-pulse rounded-[2rem] bg-white/[0.04] lg:col-span-12" />}
        {!loading && visibleModules.map((module, index) => {
          const span = previewSpans[module.id] || module.span;
          return (
            <div
              key={module.id}
              onDragOver={(event) => { if (editing) event.preventDefault(); }}
              onDrop={() => editing && dropModule(module.id)}
              className={`dashboard-module relative min-w-0 transition-[opacity,transform] ${SPAN_CLASSES[span]} ${editing ? 'rounded-[2rem] ring-2 ring-indigo-300/20 ring-offset-4 ring-offset-slate-950/40' : ''} ${draggingId === module.id ? 'scale-[0.98] opacity-45' : ''}`}
            >
              {editing && (
                <div
                  draggable={!syncing}
                  onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDraggingId(module.id); }}
                  onDragEnd={() => setDraggingId(null)}
                  className="mb-2 flex cursor-grab items-center gap-2 rounded-xl border border-white/10 bg-slate-950/90 p-2 text-slate-300 shadow-lg active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-indigo-300" />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{module.name}</span>
                  <div className="hidden items-center rounded-lg border border-white/10 lg:flex">
                    {SIZES.map((size) => <button key={size.span} type="button" disabled={syncing} onClick={() => void updateModuleSpan(module.id, size.span)} className={`px-2 py-1 text-[10px] ${span === size.span ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-white/[0.07]'}`} aria-label={`Make ${module.name} ${size.label.toLowerCase()}`}>{size.label}</button>)}
                  </div>
                  <button type="button" disabled={index === 0 || syncing} onClick={() => moveVisibleModule(module.id, 'up')} className="rounded-lg p-1.5 hover:bg-white/[0.07] disabled:opacity-25" aria-label={`Move ${module.name} earlier`}><ChevronLeft className="h-3.5 w-3.5" /></button>
                  <button type="button" disabled={index === visibleModules.length - 1 || syncing} onClick={() => moveVisibleModule(module.id, 'down')} className="rounded-lg p-1.5 hover:bg-white/[0.07] disabled:opacity-25" aria-label={`Move ${module.name} later`}><ChevronRight className="h-3.5 w-3.5" /></button>
                  <button type="button" disabled={syncing} onClick={() => void updateModule(module.id, false)} className="rounded-lg p-1.5 hover:bg-white/[0.07]" aria-label={`Hide ${module.name}`}><EyeOff className="h-3.5 w-3.5" /></button>
                </div>
              )}
              {renderModule(module.id)}
              {editing && (
                <button
                  type="button"
                  onPointerDown={(event) => startResize(event, module.id, span)}
                  className="absolute -bottom-2 -right-2 hidden h-9 w-9 cursor-se-resize items-center justify-center rounded-full border border-indigo-200/30 bg-indigo-500 text-white shadow-xl hover:bg-indigo-400 lg:flex"
                  aria-label={`Drag to resize ${module.name}`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 -rotate-45" />
                </button>
              )}
            </div>
          );
        })}
        {!loading && visibleModules.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-white/15 px-6 py-16 text-center lg:col-span-12">
            <LayoutGrid className="mx-auto h-8 w-8 text-slate-600" />
            <div className="mt-3 text-sm text-slate-400">Your dashboard is empty.</div>
            <button type="button" onClick={() => { onEditingChange(true); setWidgetTrayOpen(true); }} className="mt-4 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white">Add widgets</button>
          </div>
        )}
      </div>
    </>
  );
}
