import { ArrowRight, Download, GripVertical, LayoutDashboard, Maximize2, Package, Trash2 } from 'lucide-react';
import { CLASSDASH_PLUGIN_ID, pluginCatalog } from '../features/plugins/catalog';
import { useDashboardConfiguration } from '../hooks/useDashboardConfiguration';

export function PluginManager({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { installedPluginIds, loading, syncing, error, installPlugin, uninstallPlugin } = useDashboardConfiguration();

  if (loading) return <div className="glass-panel h-72 animate-pulse rounded-[2rem]" role="status" aria-label="Loading plugins" />;

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      <header>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.26em] text-indigo-200/80"><Package className="h-4 w-4" /> Workstation extensions</div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Plugins</h1>
        <p className="mt-2 max-w-2xl text-slate-400">Add focused tools to Olio, then place their widgets wherever you want on Home.</p>
      </header>

      {error && <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <section className="glass-panel overflow-hidden rounded-[2rem] p-6 sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-indigo-300/20 bg-indigo-400/10"><LayoutDashboard className="h-7 w-7 text-indigo-200" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-white">Make Home yours</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">Edit the real dashboard instead of configuring a separate list. Drag widgets into place, resize them from the corner, hide what you do not need, and restore it later.</p>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5"><GripVertical className="h-3.5 w-3.5 text-indigo-300" /> Drag and drop</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5"><Maximize2 className="h-3.5 w-3.5 text-indigo-300" /> Live resizing</span>
            </div>
          </div>
          <button type="button" onClick={() => onNavigate('/?edit=dashboard')} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-400">Customize Home <ArrowRight className="h-4 w-4" /></button>
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
