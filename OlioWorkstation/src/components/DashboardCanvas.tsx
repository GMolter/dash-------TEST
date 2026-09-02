import { KeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard, EyeOff, Grid2X2, LayoutGrid, Link2, Maximize2, Plus, QrCode, Redo2, RotateCcw, Undo2, X } from 'lucide-react';
import { DashboardLayoutItem, DashboardQuicklink, useFreeformDashboard } from '../hooks/useFreeformDashboard';
import { useDashboardConfiguration } from '../hooks/useDashboardConfiguration';
import { ClassDashWidget } from './ClassDashWidget';
import { DashboardTodosHomeHeader } from './DashboardTodos';

const COLUMNS = 12;
const GAP = 14;
const ROW_HEIGHT = 68;

type CanvasItem = {
  id: string;
  kind: 'classdash' | 'quicklink' | 'shortcut';
  title: string;
  minWidth: number;
  minHeight: number;
  defaultWidth: number;
  defaultHeight: number;
  quicklink?: DashboardQuicklink;
  shortcut?: 'qr' | 'quick-pastes' | 'utilities';
};

type Interaction = {
  id: string;
  mode: 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  layout: DashboardLayoutItem;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function overlaps(a: DashboardLayoutItem, b: DashboardLayoutItem) {
  if (a.hidden || b.hidden) return false;
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function resolveCollisions(layouts: Record<string, DashboardLayoutItem>, anchorId: string) {
  const next = Object.fromEntries(Object.entries(layouts).map(([id, layout]) => [id, { ...layout }]));
  const queue = [anchorId];
  const visited = new Set<string>();
  while (queue.length) {
    const activeId = queue.shift()!;
    if (visited.has(activeId)) continue;
    visited.add(activeId);
    const active = next[activeId];
    if (!active) continue;
    for (const candidate of Object.values(next)) {
      if (candidate.item_id === activeId || !overlaps(active, candidate)) continue;
      candidate.y = clamp(active.y + active.height, 0, 500 - candidate.height);
      queue.push(candidate.item_id);
    }
  }
  return next;
}

function defaultLayouts(items: CanvasItem[]) {
  const layouts: Record<string, DashboardLayoutItem> = {};
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const item of items) {
    if (x + item.defaultWidth > COLUMNS) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    layouts[item.id] = { item_id: item.id, x, y, width: item.defaultWidth, height: item.defaultHeight, hidden: false };
    x += item.defaultWidth;
    rowHeight = Math.max(rowHeight, item.defaultHeight);
    if (x >= COLUMNS) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
  }
  return layouts;
}

function mergeLayouts(items: CanvasItem[], stored: DashboardLayoutItem[]) {
  if (!stored.length) return defaultLayouts(items);
  const storedById = new Map(stored.map((layout) => [layout.item_id, layout]));
  const next: Record<string, DashboardLayoutItem> = {};
  let nextY = stored.reduce((maximum, layout) => Math.max(maximum, layout.y + layout.height), 0);
  let nextX = 0;
  for (const item of items) {
    const saved = storedById.get(item.id);
    if (saved) {
      const width = clamp(saved.width, item.minWidth, COLUMNS);
      next[item.id] = { ...saved, x: clamp(saved.x, 0, COLUMNS - width), y: clamp(saved.y, 0, 500 - saved.height), width, height: Math.max(item.minHeight, saved.height) };
      continue;
    }
    if (nextX + item.defaultWidth > COLUMNS) {
      nextX = 0;
      nextY += item.defaultHeight;
    }
    next[item.id] = { item_id: item.id, x: nextX, y: nextY, width: item.defaultWidth, height: item.defaultHeight, hidden: false };
    nextX += item.defaultWidth;
  }
  return next;
}

function formattedUrl(value: string) {
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function QuicklinkIcon({ link }: { link: DashboardQuicklink }) {
  const customImage = /^https?:\/\//i.test(link.icon || '') ? link.icon.trim() : '';
  let favicon = '';
  try { favicon = `https://www.google.com/s2/favicons?domain=${new URL(formattedUrl(link.url)).hostname}&sz=64`; } catch { /* emoji fallback */ }
  const [imageFailed, setImageFailed] = useState(false);
  if (!imageFailed && (customImage || favicon)) return <img src={customImage || favicon} alt="" className="h-12 w-12 rounded-xl object-cover" onError={() => setImageFailed(true)} />;
  return <span className="text-4xl leading-none">{link.icon && !customImage ? link.icon : '🔗'}</span>;
}

function QuicklinkCard({ link }: { link: DashboardQuicklink }) {
  return (
    <a href={formattedUrl(link.url)} className="glass-panel flex h-full min-h-0 flex-col items-center justify-center overflow-hidden rounded-[1.5rem] p-4 text-center transition hover:border-indigo-300/30 hover:bg-slate-900/55">
      <QuicklinkIcon link={link} />
      <div className="mt-3 max-w-full truncate text-sm font-semibold text-white">{link.title}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wider text-violet-300">Quick link</div>
    </a>
  );
}

const SHORTCUTS = {
  qr: { label: 'QR Generator', icon: QrCode },
  'quick-pastes': { label: 'Quick Pastes', icon: Clipboard },
  utilities: { label: 'All Utilities', icon: Grid2X2 },
} as const;

function ShortcutCard({ shortcut, onNavigate, onOpenTool }: { shortcut: keyof typeof SHORTCUTS; onNavigate: (path: string) => void; onOpenTool: (tool: string) => void }) {
  const definition = SHORTCUTS[shortcut];
  const Icon = definition.icon;
  return <button type="button" onClick={() => shortcut === 'utilities' ? onNavigate('/utilities') : onOpenTool(shortcut)} className="glass-panel flex h-full w-full flex-col items-center justify-center rounded-[1.5rem] p-4 text-center hover:border-indigo-300/30 hover:bg-slate-900/55"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-400/10"><Icon className="h-6 w-6 text-indigo-200" /></span><span className="mt-3 text-sm font-semibold text-white">{definition.label}</span><span className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">Shortcut</span></button>;
}

export function DashboardCanvas({ editing, onEditingChange, onNavigate, onOpenTool }: { editing: boolean; onEditingChange: (editing: boolean) => void; onNavigate: (path: string) => void; onOpenTool: (tool: string) => void }) {
  const { modules, syncing, error, updateModule, resetLayout } = useDashboardConfiguration();
  const { layouts: storedLayouts, quicklinks, loading, warning, saveLayouts } = useFreeformDashboard();
  const [workingLayouts, setWorkingLayouts] = useState<Record<string, DashboardLayoutItem>>({});
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<DashboardLayoutItem[][]>([]);
  const [redoStack, setRedoStack] = useState<DashboardLayoutItem[][]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(1200);

  const classdashModule = modules.find((module) => module.id === 'classdash');
  const quicklinksModule = modules.find((module) => module.id === 'quicklinks');
  const shortcutsModule = modules.find((module) => module.id === 'shortcuts');
  const tasksModule = modules.find((module) => module.id === 'tasks');

  const items = useMemo<CanvasItem[]>(() => {
    const next: CanvasItem[] = [];
    if (classdashModule?.available) next.push({ id: 'plugin:classdash', kind: 'classdash', title: 'ClassDash', minWidth: 6, minHeight: 4, defaultWidth: 12, defaultHeight: 4 });
    quicklinks.forEach((link) => next.push({ id: `quicklink:${link.id}`, kind: 'quicklink', title: link.title, minWidth: 2, minHeight: 2, defaultWidth: 3, defaultHeight: 3, quicklink: link }));
    (Object.keys(SHORTCUTS) as Array<keyof typeof SHORTCUTS>).forEach((shortcut) => next.push({ id: `shortcut:${shortcut}`, kind: 'shortcut', title: SHORTCUTS[shortcut].label, minWidth: 2, minHeight: 2, defaultWidth: 4, defaultHeight: 2, shortcut }));
    return next;
  }, [classdashModule?.available, quicklinks]);
  useEffect(() => {
    if (interactionRef.current) return;
    setWorkingLayouts(mergeLayouts(items, storedLayouts));
  }, [items, storedLayouts]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const update = () => setCanvasWidth(canvas.getBoundingClientRect().width || 1200);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const groupVisible = (item: CanvasItem) => item.kind === 'classdash' ? !!classdashModule?.enabled : item.kind === 'quicklink' ? !!quicklinksModule?.enabled : !!shortcutsModule?.enabled;
  const visibleItems = items.filter((item) => groupVisible(item) && !workingLayouts[item.id]?.hidden);
  const hiddenItems = items.filter((item) => workingLayouts[item.id]?.hidden);
  const compact = canvasWidth < 760;
  const columnWidth = Math.max(1, (canvasWidth - GAP * (COLUMNS - 1)) / COLUMNS);

  const pushHistoryAndSave = (next: Record<string, DashboardLayoutItem>) => {
    setUndoStack((history) => [...history.slice(-19), Object.values(workingLayouts)]);
    setRedoStack([]);
    setWorkingLayouts(next);
    void saveLayouts(Object.values(next));
  };

  const restoreSnapshot = (snapshot: DashboardLayoutItem[]) => {
    const next = Object.fromEntries(snapshot.map((layout) => [layout.item_id, layout]));
    setWorkingLayouts(next);
    void saveLayouts(snapshot);
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((history) => history.slice(0, -1));
    setRedoStack((history) => [...history, Object.values(workingLayouts)]);
    restoreSnapshot(previous);
  };

  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((history) => history.slice(0, -1));
    setUndoStack((history) => [...history, Object.values(workingLayouts)]);
    restoreSnapshot(next);
  };

  const beginInteraction = (event: ReactPointerEvent<HTMLElement>, id: string, mode: 'move' | 'resize') => {
    if (!editing || compact) return;
    const layout = workingLayouts[id];
    if (!layout) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { id, mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, layout: { ...layout } };
    interactionRef.current = next;
    setInteraction(next);
  };

  const moveInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    const current = interactionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    const next = { ...current, dx, dy };
    interactionRef.current = next;
    setInteraction(next);
  };

  const endInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    const current = interactionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const item = items.find((candidate) => candidate.id === current.id);
    if (!item) return;
    const nextLayout = { ...current.layout };
    if (current.mode === 'move') {
      nextLayout.x = clamp(Math.round(current.layout.x + current.dx / (columnWidth + GAP)), 0, COLUMNS - current.layout.width);
      nextLayout.y = clamp(Math.round(current.layout.y + current.dy / (ROW_HEIGHT + GAP)), 0, 500 - current.layout.height);
    } else {
      nextLayout.width = clamp(Math.round(current.layout.width + current.dx / (columnWidth + GAP)), item.minWidth, COLUMNS - current.layout.x);
      nextLayout.height = clamp(Math.round(current.layout.height + current.dy / (ROW_HEIGHT + GAP)), item.minHeight, 20);
    }
    const next = resolveCollisions({ ...workingLayouts, [current.id]: nextLayout }, current.id);
    interactionRef.current = null;
    setInteraction(null);
    pushHistoryAndSave(next);
  };

  const nudge = (event: KeyboardEvent<HTMLElement>, id: string) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const layout = workingLayouts[id];
    if (!layout) return;
    const nextLayout = { ...layout };
    if (event.key === 'ArrowLeft') nextLayout.x = clamp(layout.x - 1, 0, COLUMNS - layout.width);
    if (event.key === 'ArrowRight') nextLayout.x = clamp(layout.x + 1, 0, COLUMNS - layout.width);
    if (event.key === 'ArrowUp') nextLayout.y = Math.max(0, layout.y - 1);
    if (event.key === 'ArrowDown') nextLayout.y = Math.min(500 - layout.height, layout.y + 1);
    pushHistoryAndSave(resolveCollisions({ ...workingLayouts, [id]: nextLayout }, id));
  };

  const hideItem = (id: string) => {
    const layout = workingLayouts[id];
    if (layout) pushHistoryAndSave({ ...workingLayouts, [id]: { ...layout, hidden: true } });
  };

  const restoreItem = (id: string) => {
    const layout = workingLayouts[id];
    if (layout) pushHistoryAndSave({ ...workingLayouts, [id]: { ...layout, hidden: false } });
  };

  const resetEverything = async () => {
    const defaults = defaultLayouts(items);
    setUndoStack((history) => [...history.slice(-19), Object.values(workingLayouts)]);
    setRedoStack([]);
    setWorkingLayouts(defaults);
    await Promise.all([saveLayouts(Object.values(defaults)), resetLayout()]);
  };

  const renderItem = (item: CanvasItem) => {
    if (item.kind === 'classdash') return <ClassDashWidget onOpen={() => onNavigate('/classdash')} />;
    if (item.kind === 'quicklink' && item.quicklink) return <QuicklinkCard link={item.quicklink} />;
    if (item.kind === 'shortcut' && item.shortcut) return <ShortcutCard shortcut={item.shortcut} onNavigate={onNavigate} onOpenTool={onOpenTool} />;
    return null;
  };

  const maxBottom = visibleItems.reduce((maximum, item) => Math.max(maximum, (workingLayouts[item.id]?.y || 0) + (workingLayouts[item.id]?.height || 1)), 0);
  const canvasHeight = Math.max(260, maxBottom * (ROW_HEIGHT + GAP) - GAP);

  return (
    <>
      {tasksModule?.enabled && tasksModule.available && <DashboardTodosHomeHeader />}
      {editing && (
        <div className="sticky top-4 z-[90] mt-7 rounded-2xl border border-indigo-300/25 bg-slate-950/92 p-3 shadow-2xl backdrop-blur-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500"><LayoutGrid className="h-4 w-4" /></span>
            <div className="mr-auto min-w-0 px-1"><div className="text-sm font-semibold text-white">Arrange anything</div><div className="text-xs text-slate-400">Drag freely. Resize from any card’s lower-right corner.</div></div>
            <button type="button" onClick={undo} disabled={!undoStack.length || syncing} className="rounded-xl border border-white/10 p-2.5 text-slate-300 hover:bg-white/[0.07] disabled:opacity-30" aria-label="Undo layout change"><Undo2 className="h-4 w-4" /></button>
            <button type="button" onClick={redo} disabled={!redoStack.length || syncing} className="rounded-xl border border-white/10 p-2.5 text-slate-300 hover:bg-white/[0.07] disabled:opacity-30" aria-label="Redo layout change"><Redo2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => setTrayOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-xs font-medium text-white hover:bg-white/[0.1]"><Plus className="h-3.5 w-3.5" /> Elements</button>
            <button type="button" onClick={() => onOpenTool('quicklinks')} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-medium text-slate-300 hover:bg-white/[0.07]"><Link2 className="h-3.5 w-3.5" /> Manage links</button>
            <button type="button" onClick={() => void resetEverything()} disabled={syncing} className="rounded-xl border border-white/10 p-2.5 text-slate-300 hover:bg-white/[0.07] disabled:opacity-30" aria-label="Reset dashboard"><RotateCcw className="h-4 w-4" /></button>
            <button type="button" onClick={() => { setTrayOpen(false); onEditingChange(false); }} className="rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-400">Done</button>
          </div>
          {compact && <div className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-100">Items stack on this screen size. Open Olio wider to freely position them.</div>}
          {(warning || error) && <div className="mt-3 text-xs text-amber-200">{warning || error}</div>}
        </div>
      )}

      {editing && trayOpen && (
        <div className="relative z-[80] mt-3 rounded-2xl border border-white/10 bg-slate-950/88 p-4 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between"><div><div className="text-sm font-semibold text-white">Dashboard elements</div><div className="text-xs text-slate-400">Show or hide whole groups and individual cards.</div></div><button type="button" onClick={() => setTrayOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07]" aria-label="Close elements"><X className="h-4 w-4" /></button></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[classdashModule, quicklinksModule, shortcutsModule, tasksModule].filter(Boolean).map((module) => <button key={module!.id} type="button" disabled={!module!.available || syncing} onClick={() => void updateModule(module!.id, !module!.enabled)} className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left text-sm ${module!.enabled ? 'border-indigo-300/25 bg-indigo-400/10 text-white' : 'border-white/10 bg-white/[0.03] text-slate-400'} disabled:opacity-40`}><span>{module!.name}</span><span className="text-[10px] uppercase tracking-wider">{!module!.available ? 'Install first' : module!.enabled ? 'Shown' : 'Hidden'}</span></button>)}
          </div>
          {hiddenItems.length > 0 && <><div className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">Individually hidden</div><div className="mt-2 flex flex-wrap gap-2">{hiddenItems.map((item) => <button key={item.id} type="button" onClick={() => restoreItem(item.id)} className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-200 hover:bg-white/[0.08]">Restore {item.title}</button>)}</div></>}
        </div>
      )}

      <div
        ref={canvasRef}
        className={`relative mt-7 sm:mt-8 ${editing ? 'overflow-hidden rounded-[2rem] border border-indigo-300/20 bg-slate-950/20 shadow-inner' : ''} ${compact ? 'grid grid-cols-1 gap-4' : ''}`}
        style={!compact ? {
          height: canvasHeight,
          backgroundImage: editing ? 'radial-gradient(circle, rgba(129,140,248,.22) 1px, transparent 1px)' : undefined,
          backgroundSize: editing ? `${columnWidth + GAP}px ${ROW_HEIGHT + GAP}px` : undefined,
        } : undefined}
      >
        {loading && <div className="h-64 animate-pulse rounded-[2rem] bg-white/[0.04]" />}
        {!loading && visibleItems.map((item) => {
          const layout = workingLayouts[item.id];
          if (!layout) return null;
          const isActive = interaction?.id === item.id;
          const baseLeft = layout.x * (columnWidth + GAP);
          const baseTop = layout.y * (ROW_HEIGHT + GAP);
          const baseWidth = layout.width * columnWidth + (layout.width - 1) * GAP;
          const baseHeight = layout.height * ROW_HEIGHT + (layout.height - 1) * GAP;
          const activeWidth = isActive && interaction?.mode === 'resize' ? Math.max(item.minWidth * columnWidth, baseWidth + interaction.dx) : baseWidth;
          const activeHeight = isActive && interaction?.mode === 'resize' ? Math.max(item.minHeight * ROW_HEIGHT, baseHeight + interaction.dy) : baseHeight;
          const transform = isActive && interaction?.mode === 'move' ? `translate3d(${interaction.dx}px, ${interaction.dy}px, 0)` : undefined;
          return (
            <div
              key={item.id}
              className={`${compact ? 'relative min-h-48' : 'absolute'} ${editing ? 'rounded-[1.6rem] ring-2 ring-indigo-300/25 ring-offset-2 ring-offset-slate-950/50' : ''} ${isActive ? 'z-50 shadow-2xl shadow-indigo-950/50' : 'z-10'}`}
              style={compact ? undefined : { left: baseLeft, top: baseTop, width: activeWidth, height: activeHeight, transform, transition: isActive ? 'none' : 'left 220ms cubic-bezier(.2,.8,.2,1), top 220ms cubic-bezier(.2,.8,.2,1), width 220ms cubic-bezier(.2,.8,.2,1), height 220ms cubic-bezier(.2,.8,.2,1)', willChange: isActive ? 'transform,width,height' : undefined }}
            >
              {editing && <div role="button" tabIndex={0} aria-label={`Move ${item.title}`} onKeyDown={(event) => nudge(event, item.id)} onPointerDown={(event) => beginInteraction(event, item.id, 'move')} onPointerMove={moveInteraction} onPointerUp={endInteraction} onPointerCancel={endInteraction} className="absolute left-3 top-3 z-30 flex h-9 cursor-grab touch-none items-center gap-2 rounded-full border border-white/15 bg-slate-950/92 px-3 text-xs font-semibold text-white shadow-xl active:cursor-grabbing"><span className="grid grid-cols-2 gap-0.5" aria-hidden="true">{Array.from({ length: 6 }).map((_, index) => <span key={index} className="h-1 w-1 rounded-full bg-indigo-200" />)}</span><span className="max-w-32 truncate">{item.title}</span></div>}
              {editing && <button type="button" onClick={() => hideItem(item.id)} className="absolute right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-slate-950/92 text-slate-300 shadow-xl hover:text-white" aria-label={`Hide ${item.title}`}><EyeOff className="h-4 w-4" /></button>}
              <div className="h-full min-h-0 overflow-hidden rounded-[1.6rem]" onClickCapture={(event) => { if (editing) { event.preventDefault(); event.stopPropagation(); } }}>{renderItem(item)}</div>
              {editing && <button type="button" onPointerDown={(event) => beginInteraction(event, item.id, 'resize')} onPointerMove={moveInteraction} onPointerUp={endInteraction} onPointerCancel={endInteraction} className="absolute bottom-2 right-2 z-30 hidden h-10 w-10 cursor-se-resize touch-none items-center justify-center rounded-full border border-indigo-200/30 bg-indigo-500 text-white shadow-xl hover:bg-indigo-400 lg:flex" aria-label={`Resize ${item.title}`}><Maximize2 className="h-4 w-4" /></button>}
              {isActive && <div className="pointer-events-none absolute bottom-3 left-3 z-30 rounded-full bg-slate-950/90 px-2.5 py-1 text-[10px] font-semibold text-indigo-100">{interaction?.mode === 'move' ? 'Moving' : `${layout.width} × ${layout.height}`}</div>}
            </div>
          );
        })}
        {!loading && !visibleItems.length && <div className="flex min-h-64 items-center justify-center rounded-[2rem] border border-dashed border-white/15 p-8 text-center"><div><LayoutGrid className="mx-auto h-8 w-8 text-slate-600" /><div className="mt-3 text-sm text-slate-400">Your dashboard is empty.</div><button type="button" onClick={() => { onEditingChange(true); setTrayOpen(true); }} className="mt-4 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white">Add elements</button></div></div>}
      </div>
    </>
  );
}
