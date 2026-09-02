import { ArrowRight, ChevronDown, ChevronUp, Download, LayoutDashboard, Package, Trash2 } from 'lucide-react';
import { pluginCatalog, CLASSDASH_PLUGIN_ID } from '../features/plugins/catalog';
import { useDashboardConfiguration } from '../hooks/useDashboardConfiguration';

export function PluginManager({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { modules, installedPluginIds, loading, syncing, error, installPlugin, uninstallPlugin, updateModule, moveModule } = useDashboardConfiguration();
  const availableModules = modules.filter((module) => module.available);

  if (loading) return <div className="glass-panel h-72 animate-pulse rounded-[2rem]" role="status" aria-label="Loading plugins" />;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      <header><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.26em] text-indigo-200/80"><Package className="h-4 w-4" /> Workstation extensions</div><h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Plugins & dashboard</h1><p className="mt-2 max-w-2xl text-slate-400">Install workstation features and choose what appears on your home dashboard.</p></header>

      {error && <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <section className="glass-panel rounded-[2rem] p-6 sm:p-8">
        <div className="flex items-center gap-2 text-lg font-semibold text-white"><LayoutDashboard className="h-5 w-5 text-indigo-300" /> Home dashboard</div>
        <p className="mt-1 text-sm text-slate-400">Show, hide, and order home modules. Plugin modules become available after installation.</p>
        <div className="mt-6 space-y-3">
          {modules.map((module) => {
            const availableIndex = availableModules.findIndex((candidate) => candidate.id === module.id);
            return (
            <div key={module.id} className={`flex flex-wrap items-center gap-4 rounded-2xl border p-4 ${module.available ? 'border-white/10 bg-slate-950/35' : 'border-white/[0.06] bg-slate-950/20 opacity-55'}`}>
              <div className="min-w-0 flex-1"><div className="font-medium text-white">{module.name}</div><div className="mt-1 text-sm text-slate-400">{module.description}</div></div>
              <div className="flex items-center gap-2">
                <button type="button" disabled={!module.available || availableIndex === 0 || syncing} onClick={() => void moveModule(module.id, 'up')} className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/[0.06] disabled:opacity-30" aria-label={`Move ${module.name} up`}><ChevronUp className="h-4 w-4" /></button>
                <button type="button" disabled={!module.available || availableIndex === availableModules.length - 1 || syncing} onClick={() => void moveModule(module.id, 'down')} className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/[0.06] disabled:opacity-30" aria-label={`Move ${module.name} down`}><ChevronDown className="h-4 w-4" /></button>
                <button type="button" disabled={!module.available || syncing} onClick={() => void updateModule(module.id, !module.enabled)} className={`relative h-8 w-14 rounded-full border transition ${module.enabled ? 'border-indigo-300/40 bg-indigo-500' : 'border-white/10 bg-slate-800'}`} aria-pressed={module.enabled} aria-label={`${module.enabled ? 'Hide' : 'Show'} ${module.name}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${module.enabled ? 'left-8' : 'left-1'}`} /></button>
              </div>
            </div>
            );
          })}
        </div>
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
