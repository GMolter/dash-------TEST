import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  FolderPlus,
  LayoutGrid,
  Search,
  Sparkles,
  ChevronDown,
  X,
} from 'lucide-react';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { supabase } from '../lib/supabase';

type ProjectStatus = 'planning' | 'active' | 'review' | 'completed' | 'archived';
type Filter = 'all' | 'active' | 'completed' | 'archived';
type Sort = 'recent' | 'name' | 'status';
type Template = 'blank' | 'personal' | 'school';

type Project = {
  id: string;
  name: string;
  description: string;
  status: string;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

type BannerAction =
  | { id: string; label: string; hint: string; kind: 'action'; run: () => void }
  | { id: string; label: string; hint: string; kind: 'project'; run: () => void; disabled?: boolean };

function clampStatus(status: string): ProjectStatus {
  const s = (status || '').toLowerCase();
  if (s === 'planning' || s === 'active' || s === 'review' || s === 'completed' || s === 'archived') return s;
  return 'active';
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString();
}

function statusPill(status: ProjectStatus) {
  switch (status) {
    case 'planning':
      return 'bg-sky-500/15 text-sky-200 border-sky-500/25';
    case 'active':
      return 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25';
    case 'review':
      return 'bg-amber-500/15 text-amber-100 border-amber-500/25';
    case 'completed':
      return 'bg-indigo-500/15 text-indigo-200 border-indigo-500/25';
    case 'archived':
    default:
      return 'bg-slate-500/15 text-slate-200 border-slate-500/25';
  }
}

function stopIfEditableTarget(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

function navigateTo(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function ProjectsCenterApp({
  onOpenProject,
}: {
  onOpenProject: (id: string) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [ctrlHintOpen, setCtrlHintOpen] = useState(false);

  // Create form
  const [template, setTemplate] = useState<Template>('blank');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Command palette
  const [commandQuery, setCommandQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const commandInputRef = useRef<HTMLInputElement | null>(null);

  // Ctrl-hold overlay timer
  const ctrlHoldTimer = useRef<number | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
    setProjects((data as Project[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Visible projects (grid)
  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = projects;

    if (filter !== 'all') {
      list = list.filter((p) => {
        const s = clampStatus(p.status);
        if (filter === 'active') return s === 'planning' || s === 'active' || s === 'review';
        if (filter === 'completed') return s === 'completed';
        if (filter === 'archived') return s === 'archived';
        return true;
      });
    }

    if (q) {
      list = list.filter((p) => {
        const hay = `${p.name} ${p.description} ${((p.tags || []) as string[]).join(' ')}`.toLowerCase();
        return hay.includes(q);
      });
    }

    const sorted = [...list];
    if (sort === 'recent') {
      sorted.sort(
        (a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
      );
    } else if (sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'status') {
      sorted.sort((a, b) => clampStatus(a.status).localeCompare(clampStatus(b.status)));
    }

    return sorted;
  }, [projects, query, filter, sort]);

  // Command items (actions + projects)
  const commandItems = useMemo<BannerAction[]>(() => {
    const q = commandQuery.trim().toLowerCase();

    const actions: BannerAction[] = [
      {
        id: 'new-project',
        kind: 'action',
        label: 'Create new project…',
        hint: 'Templates',
        run: () => {
          setCommandOpen(false);
          setCreateOpen(true);
        },
      },
      {
        id: 'filter-all',
        kind: 'action',
        label: 'Filter: All projects',
        hint: 'View',
        run: () => {
          setFilter('all');
          setCommandOpen(false);
        },
      },
      {
        id: 'filter-active',
        kind: 'action',
        label: 'Filter: Active projects',
        hint: 'View',
        run: () => {
          setFilter('active');
          setCommandOpen(false);
        },
      },
      {
        id: 'filter-completed',
        kind: 'action',
        label: 'Filter: Completed projects',
        hint: 'View',
        run: () => {
          setFilter('completed');
          setCommandOpen(false);
        },
      },
      {
        id: 'filter-archived',
        kind: 'action',
        label: 'Filter: Archived projects',
        hint: 'View',
        run: () => {
          setFilter('archived');
          setCommandOpen(false);
        },
      },
    ];

    const proj: BannerAction[] = projects.slice(0, 60).map((p) => ({
      id: `open-${p.id}`,
      kind: 'project',
      label: `Open: ${p.name}`,
      hint: 'Project',
      run: () => {
        setCommandOpen(false);
        onOpenProject(p.id);
      },
    }));

    const all = [...actions, ...proj];

    if (!q) return all;
    return all.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q));
  }, [commandQuery, projects, onOpenProject]);

  // Keep selectedIndex in bounds when list changes
  useEffect(() => {
    if (!commandOpen) return;
    setSelectedIndex((i) => Math.min(i, Math.max(0, commandItems.length - 1)));
  }, [commandItems.length, commandOpen]);

  // Global hotkeys:
  // - Ctrl+K opens palette
  // - Hold Ctrl shows shortcut overlay
  // - Arrow/Enter for palette selection
  // - Esc closes
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl-hold overlay
      if (e.key === 'Control') {
        if (ctrlHoldTimer.current) window.clearTimeout(ctrlHoldTimer.current);
        ctrlHoldTimer.current = window.setTimeout(() => setCtrlHintOpen(true), 550);
      }

      // Ctrl+K command palette
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        if (stopIfEditableTarget(e)) return;
        e.preventDefault();
        setCommandOpen(true);
        setCtrlHintOpen(false);
        setSelectedIndex(0);
        window.setTimeout(() => commandInputRef.current?.focus(), 0);
      }

      // Palette navigation
      if (commandOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, Math.max(0, commandItems.length - 1)));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const item = commandItems[selectedIndex];
          if (!item) return;
          item.run();
        }
      }

      if (e.key === 'Escape') {
        setCommandOpen(false);
        setCreateOpen(false);
        setCtrlHintOpen(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        if (ctrlHoldTimer.current) window.clearTimeout(ctrlHoldTimer.current);
        ctrlHoldTimer.current = null;
        setCtrlHintOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [commandOpen, commandItems, selectedIndex]);

  useEffect(() => {
    if (!commandOpen) {
      setCommandQuery('');
      setSelectedIndex(0);
    }
  }, [commandOpen]);

  async function createProject() {
    const name = newName.trim();
    if (!name) return;

    const tagSeed = template === 'blank' ? [] : template === 'personal' ? ['personal'] : ['school'];

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name,
        description: newDesc.trim(),
        status: 'planning',
        tags: tagSeed,
      })
      .select('*')
      .single();

    if (!error && data) {
      setCreateOpen(false);
      setNewName('');
      setNewDesc('');
      setTemplate('blank');
      await load();
    }
  }

  return (
    <div className="min-h-screen text-white relative overflow-hidden">
      <AnimatedBackground />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="border-b border-slate-800/50 bg-slate-950/75 backdrop-blur">
          <div className="px-8 py-5 flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigateTo('/utilities')}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl border border-slate-800/60 bg-slate-900/25 hover:bg-slate-900/45 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">Back to Utilities</span>
              </button>

              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-400" />
                <div className="leading-tight">
                  <div className="text-lg font-semibold tracking-tight">Olio</div>
                  <div className="text-sm text-slate-300">Projects Center</div>
                </div>
              </div>
            </div>

            {/* Global search (Ctrl+K) */}
            <button
              onClick={() => {
                setCommandOpen(true);
                setSelectedIndex(0);
                window.setTimeout(() => commandInputRef.current?.focus(), 0);
              }}
              className="hidden md:flex items-center gap-3 w-[560px] max-w-[45vw] px-4 py-3 rounded-2xl border border-slate-800/60 bg-slate-900/30 hover:bg-slate-900/45 transition-colors"
            >
              <Search className="w-5 h-5 text-slate-300" />
              <span className="text-slate-300">Search projects, actions, content…</span>
              <span className="ml-auto text-xs text-slate-400 border border-slate-700/70 rounded-lg px-2 py-1">
                Ctrl K
              </span>
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-blue-500/20 border border-blue-500/30 text-blue-200 hover:bg-blue-500/25 transition-colors"
              >
                <FolderPlus className="w-5 h-5" />
                <span className="font-medium">New Project</span>
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-8 py-8">
          {/* Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-6">
            <div className="flex-1 flex items-center gap-3">
              <div className="relative flex-1 max-w-[680px]">
                <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full pl-12 pr-4 py-3 rounded-2xl bg-slate-950/40 border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              <div className="flex items-center gap-2">
                <PillButton active={filter === 'all'} onClick={() => setFilter('all')}>
                  All
                </PillButton>
                <PillButton active={filter === 'active'} onClick={() => setFilter('active')}>
                  Active
                </PillButton>
                <PillButton active={filter === 'completed'} onClick={() => setFilter('completed')}>
                  Completed
                </PillButton>
                <PillButton active={filter === 'archived'} onClick={() => setFilter('archived')}>
                  Archived
                </PillButton>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Dropdown<Sort>
                value={sort}
                onChange={setSort}
                buttonClassName="inline-flex items-center gap-2 px-4 py-3 rounded-2xl border border-slate-800/60 bg-slate-950/20 hover:bg-slate-900/35"
                renderValue={(v) => (
                  <span className="inline-flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4 text-slate-300" />
                    <span className="text-slate-200">
                      Sort: {v === 'recent' ? 'Recent' : v === 'name' ? 'Name' : 'Status'}
                    </span>
                  </span>
                )}
                options={[
                  { value: 'recent', label: 'Recent' },
                  { value: 'name', label: 'Name' },
                  { value: 'status', label: 'Status' },
                ]}
              />
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            <button
              onClick={() => setCreateOpen(true)}
              className="group rounded-3xl border border-slate-800/60 bg-slate-950/20 hover:bg-slate-900/35 transition-colors p-5 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                  <FolderPlus className="w-6 h-6 text-blue-200" />
                </div>
                <div>
                  <div className="text-base font-semibold">Create a project</div>
                  <div className="text-sm text-slate-300">Blank, personal, or school templates</div>
                </div>
              </div>
              <div className="mt-4 text-sm text-slate-400">Name it now, edit details later.</div>
            </button>

            {loading ? (
              <div className="col-span-full text-slate-300">Loading projects…</div>
            ) : visibleProjects.length === 0 ? (
              <div className="col-span-full text-slate-300">No projects found.</div>
            ) : (
              visibleProjects.map((p) => {
                const st = clampStatus(p.status);
                const progress = 0;
                return (
                  <div
                    key={p.id}
                    className="group rounded-3xl border border-slate-800/60 bg-slate-950/20 p-5 text-left opacity-90"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold truncate">{p.name}</div>
                        {p.description?.trim() ? (
                          <div className="mt-1 text-sm text-slate-300 line-clamp-2">{p.description}</div>
                        ) : (
                          <div className="mt-1 text-sm text-slate-500">No description</div>
                        )}
                      </div>
                      <div className={`shrink-0 px-3 py-1 rounded-2xl border text-xs ${statusPill(st)}`}>{st}</div>
                    </div>

                    <div className="mt-4 flex items-center gap-3 text-sm">
                      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-slate-900/30 border border-slate-800/60">
                        <LayoutGrid className="w-4 h-4 text-slate-300" />
                        <span className="text-slate-200">Progress</span>
                        <span className="ml-1 font-mono text-slate-100">{progress}%</span>
                      </div>

                      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-slate-900/30 border border-slate-800/60">
                        <Clock className="w-4 h-4 text-slate-300" />
                        <span className="text-slate-200">Updated</span>
                        <span className="ml-1 text-slate-100">{formatRelative(p.updated_at || p.created_at)}</span>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {(p.tags || []).slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="px-3 py-1 rounded-2xl text-xs bg-slate-900/35 border border-slate-800/60 text-slate-200"
                        >
                          {t}
                        </span>
                      ))}
                      {(p.tags || []).length > 4 && (
                        <span className="px-3 py-1 rounded-2xl text-xs bg-slate-900/35 border border-slate-800/60 text-slate-300">
                          +{(p.tags || []).length - 4}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => onOpenProject(p.id)}
                      className="mt-4 w-full px-4 py-3 rounded-2xl border border-slate-800/60 bg-slate-900/20 hover:bg-slate-900/35 text-slate-100 transition-colors"
                    >
                      Open Project
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>

      {/* Ctrl-hold hints */}
      {ctrlHintOpen && (
        <div className="fixed inset-0 z-40 pointer-events-none flex items-start justify-center pt-24">
          <div className="pointer-events-auto w-[520px] max-w-[90vw] rounded-3xl border border-slate-800/60 bg-slate-950/90 backdrop-blur p-5 shadow-2xl">
            <div className="text-sm text-slate-300">Keyboard shortcuts</div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-200">Search / Command palette</span>
                <span className="font-mono text-slate-100 border border-slate-700/70 rounded-lg px-2 py-1">Ctrl K</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-200">Close modals</span>
                <span className="font-mono text-slate-100 border border-slate-700/70 rounded-lg px-2 py-1">Esc</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {createOpen && (
        <Modal
          title="Create a project"
          subtitle="Name it now. You can change everything later."
          onClose={() => setCreateOpen(false)}
          widthClass="w-[820px] max-w-[92vw]"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TemplateCard
              active={template === 'blank'}
              title="Blank Project"
              desc="Minimal structure. Build your own workflow."
              icon={<LayoutGrid className="w-5 h-5 text-slate-200" />}
              iconClass="border-slate-800/60 bg-slate-900/25"
              onClick={() => setTemplate('blank')}
            />
            <TemplateCard
              active={template === 'personal'}
              title="Personal Project"
              desc="Goals, inspiration, resources—ready to go."
              icon={<Sparkles className="w-5 h-5 text-emerald-200" />}
              iconClass="border-emerald-500/25 bg-emerald-500/10"
              onClick={() => setTemplate('personal')}
            />
            <TemplateCard
              active={template === 'school'}
              title="School Project"
              desc="Planning folder, rubric, and submission tracking."
              icon={<CheckCircle2 className="w-5 h-5 text-indigo-200" />}
              iconClass="border-indigo-500/25 bg-indigo-500/10"
              onClick={() => setTemplate('school')}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-slate-300 mb-2">Project name</div>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Mixer’s Playbox"
                className="w-full px-4 py-3 rounded-2xl bg-slate-950/40 border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            <div>
              <div className="text-sm text-slate-300 mb-2">Status</div>
              <div className="w-full px-4 py-3 rounded-2xl bg-slate-950/40 border border-slate-800/60 text-slate-200">
                Planning
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm text-slate-300 mb-2">Description</div>
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Optional: what is this project about?"
              rows={4}
              className="w-full px-4 py-3 rounded-2xl bg-slate-950/40 border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={() => setCreateOpen(false)}
              className="px-4 py-3 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
            >
              Cancel
            </button>
            <button
              onClick={createProject}
              disabled={!newName.trim()}
              className={`px-4 py-3 rounded-2xl border transition-colors ${
                newName.trim()
                  ? 'bg-blue-500/20 border-blue-500/30 text-blue-200 hover:bg-blue-500/25'
                  : 'bg-slate-900/20 border-slate-800/60 text-slate-500 cursor-not-allowed'
              }`}
            >
              Create Project
            </button>
          </div>
        </Modal>
      )}

      {/* Command Palette */}
      {commandOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-6 pt-24">
          <button className="absolute inset-0 bg-black/55" onClick={() => setCommandOpen(false)} aria-label="Close" />
          <div className="relative w-[720px] max-w-[92vw] rounded-3xl border border-slate-800/60 bg-slate-950/92 backdrop-blur shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800/60 flex items-center gap-3">
              <Search className="w-5 h-5 text-slate-300" />
              <input
                ref={commandInputRef}
                value={commandQuery}
                onChange={(e) => {
                  setCommandQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Search actions and projects…"
                className="w-full bg-transparent text-slate-100 placeholder-slate-400 focus:outline-none"
              />
              <span className="text-xs text-slate-400 border border-slate-700/70 rounded-lg px-2 py-1">Esc</span>
            </div>

            <div className="max-h-[520px] overflow-auto p-2">
              {commandItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;

                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => item.run()}
                    className={`w-full text-left px-4 py-3 rounded-2xl transition-colors flex items-center justify-between gap-4 ${
                      isSelected ? 'bg-slate-900/55' : 'hover:bg-slate-900/45'
                    }`}
                  >
                    <span className="text-slate-100">{item.label}</span>
                    <span className="text-xs text-slate-400">{item.hint}</span>
                  </button>
                );
              })}
              {commandItems.length === 0 && <div className="px-4 py-6 text-slate-300">No results.</div>}
            </div>

            <div className="px-4 py-3 border-t border-slate-800/60 text-xs text-slate-400">
              <span>Use ↑ ↓ then Enter</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- UI bits --------------------------------- */

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-2xl border text-sm transition-colors ${
        active
          ? 'bg-slate-800/60 border-slate-700 text-white'
          : 'bg-slate-950/20 border-slate-800/60 text-slate-300 hover:bg-slate-900/35'
      }`}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  widthClass = 'w-[760px] max-w-[92vw]',
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  widthClass?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button className="absolute inset-0 bg-black/55" onClick={onClose} aria-label="Close" />
      <div
        className={`relative ${widthClass} rounded-3xl border border-slate-800/60 bg-slate-950/90 backdrop-blur p-6 shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">{title}</div>
            {subtitle ? <div className="mt-1 text-slate-300">{subtitle}</div> : null}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function TemplateCard({
  active,
  title,
  desc,
  icon,
  iconClass,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  icon: React.ReactNode;
  iconClass: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-3xl border transition-colors p-5 text-left ${
        active ? 'border-blue-500/40 bg-blue-500/10' : 'border-slate-800/60 bg-slate-950/25 hover:bg-slate-900/40'
      }`}
    >
      <div className={`h-11 w-11 rounded-2xl border flex items-center justify-center ${iconClass}`}>{icon}</div>
      <div className="mt-4 font-semibold">{title}</div>
      <div className="mt-1 text-sm text-slate-300">{desc}</div>
    </button>
  );
}

function Dropdown<T extends string>({
  value,
  onChange,
  options,
  renderValue,
  buttonClassName,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  renderValue: (v: T) => React.ReactNode;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (wrapRef.current && !wrapRef.current.contains(t)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={
          buttonClassName ||
          'inline-flex items-center gap-2 px-4 py-3 rounded-2xl border border-slate-800/60 bg-slate-950/20 hover:bg-slate-900/35'
        }
      >
        {renderValue(value)}
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-800/60 bg-slate-950/95 backdrop-blur shadow-xl overflow-hidden z-20">
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                  active ? 'bg-slate-900/65 text-white' : 'text-slate-200 hover:bg-slate-900/45'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
