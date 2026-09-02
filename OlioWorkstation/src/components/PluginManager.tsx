import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Download, GripVertical, LayoutDashboard, Package, Trash2 } from 'lucide-react';
import { pluginCatalog, CLASSDASH_PLUGIN_ID, DashboardModuleId, DashboardModuleSpan } from '../features/plugins/catalog';
import { useDashboardConfiguration } from '../hooks/useDashboardConfiguration';

const SPAN_CLASSES: Record<DashboardModuleSpan, string> = {
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
  8: 'lg:col-span-8',
  12: 'lg:col-span-12',
};

const SIZE_OPTIONS: Array<{ span: DashboardModuleSpan; label: string }> = [
  { span: 4, label: 'S' },
  { span: 6, label: 'M' },
  { span: 8, label: 'L' },
  { span: 12, label: 'Full' },
];

export function PluginManager({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { modules, installedPluginIds, loading, syncing, error, installPlugin, uninstallPlugin, updateModule, moveModule, reorderModules, updateModuleSpan } = useDashboardConfiguration();
  const [draggingId, setDraggingId] = useState<DashboardModuleId | null>(null);
  const layoutModules = modules.filter((module) => module.id !== 'tasks');
  const availableModules = layoutModules.filter((module) => module.available);
  const tasksModule = modules.find((module) => module.id === 'tasks');

  const dropModule = (targetId: DashboardModuleId) => {
    if (!draggingId || draggingId === targetId) return;
    const ids = availableModules.map((module) => module.id);
    const fromIndex = ids.indexOf(draggingId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, moved);
    setDraggingId(null);
    void reorderModules(ids);
  };

  if (loading) return <div className="glass-panel h-72 animate-pulse rounded-[2rem]" role="status" aria-label="Loading plugins" />;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      <header><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.26em] text-indigo-200/80"><Package className="h-4 w-4" /> Workstation extensions</div><h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Plugins & dashboard</h1><p className="mt-2 max-w-2xl text-slate-400">Install workstation features and choose what appears on your home dashboard.</p></header>

      {error && <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <section className="glass-panel rounded-[2rem] p-6 sm:p-8">
        <div className="flex items-center gap-2 text-lg font-semibold text-white"><LayoutDashboard className="h-5 w-5 text-indigo-300" /> Home dashboard</div>
        <p className="mt-1 text-sm text-slate-400">Drag modules to place them, choose their width, or hide them. On phones they stack automatically.</p>
        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-12">
          {layoutModules.map((module) => {
            const availableIndex = availableModules.findIndex((candidate) => candidate.id === module.id);
            return (
            <div
              key={module.id}
              draggable={module.available && !syncing}
              onDragStart={() => setDraggingId(module.id)}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(event) => { if (module.available) event.preventDefault(); }}
              onDrop={() => dropModule(module.id)}
              className={`${SPAN_CLASSES[module.span]} rounded-2xl border p-4 transition ${module.available ? 'border-white/10 bg-slate-950/35' : 'border-white/[0.06] bg-slate-950/20 opacity-55'} ${draggingId === module.id ? 'scale-[0.98] border-indigo-300/40 opacity-60' : ''}`}
            >
              <div className="flex items-start gap-3">
                <GripVertical className="mt-0.5 h-5 w-5 shrink-0 cursor-grab text-slate-600" />
                <div className="min-w-0 flex-1"><div className="font-medium text-white">{module.name}</div><div className="mt-1 text-xs leading-relaxed text-slate-400">{module.description}</div></div>
                <button type="button" disabled={!module.available || syncing} onClick={() => void updateModule(module.id, !module.enabled)} className={`relative h-7 w-12 shrink-0 rounded-full border transition ${module.enabled ? 'border-indigo-300/40 bg-indigo-500' : 'border-white/10 bg-slate-800'}`} aria-pressed={module.enabled} aria-label={`${module.enabled ? 'Hide' : 'Show'} ${module.name}`}><span className={`absolute top-1 h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${module.enabled ? 'left-6' : 'left-1'}`} /></button>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
                <div className="flex items-center overflow-hidden rounded-lg border border-white/10" aria-label={`${module.name} size`}>
                  {SIZE_OPTIONS.map((option) => <button key={option.span} type="button" disabled={!module.available || syncing} onClick={() => void updateModuleSpan(module.id, option.span)} className={`px-2.5 py-1.5 text-[11px] font-semibold transition ${module.span === option.span ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-white/[0.06]'}`} aria-pressed={module.span === option.span}>{option.label}</button>)}
                </div>
                <div className="flex gap-1">
                  <button type="button" disabled={!module.available || availableIndex === 0 || syncing} onClick={() => void moveModule(module.id, 'up')} className="rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/[0.06] disabled:opacity-30" aria-label={`Move ${module.name} earlier`}><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button type="button" disabled={!module.available || availableIndex === availableModules.length - 1 || syncing} onClick={() => void moveModule(module.id, 'down')} className="rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/[0.06] disabled:opacity-30" aria-label={`Move ${module.name} later`}><ChevronDown className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
        {tasksModule && (
          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/25 p-4">
            <div className="min-w-0 flex-1"><div className="font-medium text-white">{tasksModule.name}</div><div className="mt-1 text-sm text-slate-400">Floating dashboard control</div></div>
            <button type="button" disabled={syncing} onClick={() => void updateModule(tasksModule.id, !tasksModule.enabled)} className={`relative h-8 w-14 rounded-full border transition ${tasksModule.enabled ? 'border-indigo-300/40 bg-indigo-500' : 'border-white/10 bg-slate-800'}`} aria-pressed={tasksModule.enabled} aria-label={`${tasksModule.enabled ? 'Hide' : 'Show'} ${tasksModule.name}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${tasksModule.enabled ? 'left-8' : 'left-1'}`} /></button>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold text-white">Plugin catalog</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {pluginCatalog.map((plugin) => {
            const Icon = plugin.icon;
            const installed = installedPluginIds.has(plugin.id);
            return (
              <article key={plugin.id} className="glass-panel rounded-[2rem] p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-400/10"><Icon className="h-6 w-6 text-violet-200" /></div>
                <div className="mt-5 flex items-center gap-2"><h3 className="text-xl font-semibold text-white">{plugin.name}</h3>{installed && <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">Installed</span>}</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{plugin.description}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {installed ? <><button type="button" onClick={() => onNavigate(plugin.route)} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-400">Open & configure <ArrowRight className="h-4 w-4" /></button><button type="button" disabled={syncing} onClick={() => { if (window.confirm(`Uninstall ${plugin.name}? Your saved schedule will be kept in case you reinstall.`)) void uninstallPlugin(plugin.id); }} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-2.5 text-sm text-rose-200 hover:bg-rose-400/15"><Trash2 className="h-4 w-4" /> Uninstall</button></> : <button type="button" disabled={syncing} onClick={async () => { const success = await installPlugin(plugin.id); if (success && plugin.id === CLASSDASH_PLUGIN_ID) onNavigate(plugin.route); }} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"><Download className="h-4 w-4" /> Install</button>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
