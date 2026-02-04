import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Folder,
  LayoutGrid,
  Columns3,
  CalendarDays,
  FileText,
  Link2,
  Search,
  Settings,
  Plus,
} from 'lucide-react';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { PlannerView } from '../components/PlannerView';
import { BoardView } from '../components/BoardView';
import { ResourcesView } from '../components/ResourcesView';
import { OverviewView } from '../components/OverviewView';
import { supabase } from '../lib/supabase';
import {
  FileNode,
  ensureDefaultTree,
  listNodes,
  createFolder,
  createDoc,
  updateNode,
  deleteNode,
  moveNode,
  uploadAttachment,
} from '../projectFiles/store';
import { FileTreePanel } from '../projectFiles/FileTreePanel';
import { DocEditor } from '../projectFiles/DocEditor';
import { NameModal } from '../projectFiles/NameModal';
import { ContextMenu, ContextMenuItem } from '../projectFiles/ContextMenu';

type Tab = 'overview' | 'board' | 'planner' | 'files' | 'resources';

type Project = {
  id: string;
  name: string;
  description: string;
  status: string;
  updated_at: string;
};

function clampStatus(s: string) {
  const v = (s || '').toLowerCase();
  if (['planning', 'active', 'review', 'completed', 'archived'].includes(v)) return v;
  return 'planning';
}

function formatRelative(iso?: string) {
  if (!iso) return '';
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

function statusPill(status: string) {
  const s = clampStatus(status);
  switch (s) {
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

export function ProjectDashboard({
  projectId,
  onBack,
}: {
  projectId?: string;
  onBack: () => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  // Project search (top)
  const [projectSearch, setProjectSearch] = useState('');

  // Files state
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [branchOpen, setBranchOpen] = useState(true);

  // Modals
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameModalMode, setNameModalMode] = useState<'folder' | 'doc' | 'rename'>('doc');
  const [nameModalParentId, setNameModalParentId] = useState<string | null>(null);
  const [nameModalTargetId, setNameModalTargetId] = useState<string | null>(null);

  // Context menu
  const [ctx, setCtx] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  // Quick capture
  const [qcOpen, setQcOpen] = useState(false);
  const qcWrapRef = useRef<HTMLDivElement | null>(null);

  async function loadProject() {
    if (!projectId) return;
    const { data } = await supabase.from('projects').select('*').eq('id', projectId).single();
    setProject((data as Project) || null);
  }

  async function loadFiles() {
    if (!projectId) return;
    await ensureDefaultTree(projectId);
    const list = await listNodes(projectId);
    setNodes(list);
    if (!selectedId) {
      const firstDoc = list.find((n) => n.type === 'doc');
      setSelectedId(firstDoc?.id || null);
    }
  }

  useEffect(() => {
    loadProject();
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Tab changes
  useEffect(() => {
    if (tab === 'files') setBranchOpen(true);
    else setBranchOpen(false);
  }, [tab]);

  // Close QC if clicking outside
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (qcWrapRef.current && !qcWrapRef.current.contains(t)) setQcOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  // Ctrl+K focuses project search
  const projectSearchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        if (stopIfEditableTarget(e)) return;
        e.preventDefault();
        projectSearchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setQcOpen(false);
        setCtx(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectedDoc = useMemo(
    () => nodes.find((n) => n.id === selectedId && n.type === 'doc') || null,
    [nodes, selectedId],
  );

  async function onCreate(name: string) {
    if (!projectId) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    if (nameModalMode === 'folder') {
      await createFolder(projectId, trimmed, nameModalParentId);
    } else if (nameModalMode === 'doc') {
      const doc = await createDoc(projectId, trimmed, nameModalParentId);
      setSelectedId(doc?.id || null);
    } else if (nameModalMode === 'rename' && nameModalTargetId) {
      await updateNode(nameModalTargetId, { name: trimmed });
    }

    setNameModalOpen(false);
    setNameModalParentId(null);
    setNameModalTargetId(null);
    await loadFiles();
  }

  async function onDelete(nodeId: string) {
    await deleteNode(nodeId);
    if (selectedId === nodeId) setSelectedId(null);
    await loadFiles();
  }

  async function onMove(dragId: string, targetFolderId: string | null) {
    await moveNode(dragId, targetFolderId);
    await loadFiles();
  }

  const ctxItems: ContextMenuItem[] = useMemo(() => {
    if (!ctx) return [];
    const n = nodes.find((x) => x.id === ctx.nodeId);
    if (!n) return [];
    return [
      {
        id: 'rename',
        label: 'Rename',
        onClick: () => {
          setCtx(null);
          setNameModalMode('rename');
          setNameModalTargetId(n.id);
          setNameModalOpen(true);
        },
      },
      {
        id: 'new-doc',
        label: 'New document',
        onClick: () => {
          setCtx(null);
          setNameModalMode('doc');
          setNameModalParentId(n.type === 'folder' ? n.id : n.parent_id);
          setNameModalOpen(true);
        },
      },
      {
        id: 'new-folder',
        label: 'New folder',
        onClick: () => {
          setCtx(null);
          setNameModalMode('folder');
          setNameModalParentId(n.type === 'folder' ? n.id : n.parent_id);
          setNameModalOpen(true);
        },
      },
      {
        id: 'delete',
        label: 'Delete',
        destructive: true,
        onClick: () => {
          setCtx(null);
          onDelete(n.id);
        },
      },
    ];
  }, [ctx, nodes, selectedId]);

  return (
    <div className="min-h-screen text-white relative overflow-hidden">
      <AnimatedBackground />
      {/* readability veil (keeps text readable vs the animation) */}
      <div className="absolute inset-0 bg-slate-950/45" />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="border-b border-slate-800/50 bg-slate-950/75 backdrop-blur">
          <div className="px-8 py-5 flex items-center justify-between gap-6">
            <div className="flex items-center gap-4 min-w-0">
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl border border-slate-800/60 bg-slate-900/25 hover:bg-slate-900/45 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">Back to Projects</span>
              </button>

              <div className="min-w-0">
                <div className="text-lg font-semibold truncate">{project?.name || 'Project'}</div>
                <div className="text-sm text-slate-300 flex items-center gap-3">
                  <span
                    className={`px-2.5 py-1 rounded-2xl border text-xs ${statusPill(
                      project?.status || 'planning',
                    )}`}
                  >
                    {clampStatus(project?.status || 'planning')}
                  </span>
                  <span className="text-slate-400">Updated {formatRelative(project?.updated_at)}</span>
                </div>
              </div>
            </div>

            <div className="flex-1 flex justify-center">
              <div className="w-[680px] max-w-[60vw] relative">
                <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  ref={projectSearchRef}
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  placeholder="Search within this project…"
                  className="w-full pl-12 pr-16 py-3 rounded-2xl bg-slate-950/50 border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 border border-slate-700/70 rounded-xl px-2.5 py-1">
                  Ctrl K
                </div>
              </div>
            </div>

            <div className="w-[240px] flex justify-end">{/* empty */}</div>
          </div>
        </header>

        <main className="flex-1 px-8 py-8">
          <div className="grid grid-cols-12 gap-6">
            {/* Left nav */}
            <aside className="col-span-12 lg:col-span-3 2xl:col-span-2">
              <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-4">
                <div className="rounded-3xl border border-slate-800/60 bg-slate-950/40 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Project</div>
                  <div className="mt-2 font-semibold truncate">{project?.name || '—'}</div>
                  <button
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
                    onClick={() => {
                      /* project settings later */
                    }}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  <NavItem
                    active={tab === 'overview'}
                    icon={<LayoutGrid className="w-4 h-4" />}
                    label="Overview"
                    onClick={() => setTab('overview')}
                  />
                  <NavItem
                    active={tab === 'board'}
                    icon={<Columns3 className="w-4 h-4" />}
                    label="Board"
                    onClick={() => setTab('board')}
                  />
                  <NavItem
                    active={tab === 'planner'}
                    icon={<CalendarDays className="w-4 h-4" />}
                    label="Planner"
                    onClick={() => setTab('planner')}
                  />
                  <NavItem
                    active={tab === 'files'}
                    icon={<FileText className="w-4 h-4" />}
                    label="Files"
                    onClick={() => setTab('files')}
                    rightHint={branchOpen ? 'Open' : ''}
                  />
                  <NavItem
                    active={tab === 'resources'}
                    icon={<Link2 className="w-4 h-4" />}
                    label="Resources"
                    onClick={() => setTab('resources')}
                  />
                </div>
              </div>
            </aside>

            {/* Branch panel (Files tree) */}
            {tab === 'files' && branchOpen && (
              <section className="col-span-12 lg:col-span-3 2xl:col-span-3">
                <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-4 h-[calc(100vh-220px)] min-h-[520px] flex flex-col">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">Files</div>
                      <div className="text-xs text-slate-400">Documents and folders</div>
                    </div>
                    <button
                      onClick={() => setBranchOpen(false)}
                      className="px-3 py-2 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setNameModalMode('folder');
                        setNameModalParentId(null);
                        setNameModalOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
                      title="New folder"
                    >
                      <Folder className="w-4 h-4" />
                      <span className="text-sm">Folder</span>
                    </button>
                    <button
                      onClick={() => {
                        setNameModalMode('doc');
                        setNameModalParentId(null);
                        setNameModalOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
                      title="New document"
                    >
                      <FileText className="w-4 h-4" />
                      <span className="text-sm">Doc</span>
                    </button>

                    <label className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45 cursor-pointer">
                      <span className="text-sm">Upload</span>
                      <input
                        type="file"
                        className="hidden"
                        accept=".txt,.pdf,.docx,.doc,.rtf,.md,.png,.jpg,.jpeg,.gif,.svg"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file || !projectId) return;
                          await uploadAttachment(projectId, file, null);
                          await loadFiles();
                        }}
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex-1 overflow-auto pr-1">
                    <FileTreePanel
                      nodes={nodes}
                      selectedId={selectedId}
                      onSelect={(id) => setSelectedId(id)}
                      onRequestNewDoc={(parentId) => {
                        setNameModalMode('doc');
                        setNameModalParentId(parentId);
                        setNameModalOpen(true);
                      }}
                      onRequestNewFolder={(parentId) => {
                        setNameModalMode('folder');
                        setNameModalParentId(parentId);
                        setNameModalOpen(true);
                      }}
                      onMove={onMove}
                      onContextMenu={(nodeId, x, y) => setCtx({ nodeId, x, y })}
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Main content */}
            <section
              className={
                tab === 'files' && branchOpen
                  ? 'col-span-12 lg:col-span-6 2xl:col-span-7'
                  : 'col-span-12 lg:col-span-9 2xl:col-span-10'
              }
            >
              {tab === 'overview' && projectId && <OverviewView projectId={projectId} />}
              {tab === 'board' && projectId && <BoardView projectId={projectId} />}
              {tab === 'planner' && projectId && <PlannerView projectId={projectId} />}
              {tab === 'resources' && projectId && <ResourcesView projectId={projectId} />}

              {tab === 'files' && (
                <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6 min-h-[520px]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-2xl font-semibold">Files</div>
                      <div className="text-slate-300">
                        Create folders and documents. Content saves automatically.
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    {selectedDoc ? (
                      <DocEditor
                        key={selectedDoc.id}
                        projectId={projectId || ''}
                        doc={selectedDoc}
                        onTitleChange={async (name) => {
                          await updateNode(selectedDoc.id, { name });
                          await loadFiles();
                        }}
                        onContentChange={(content) => {
                          setNodes((prev) =>
                            prev.map((n) => (n.id === selectedDoc.id ? { ...n, content } : n)),
                          );
                        }}
                        onSaved={async () => {
                          await loadProject();
                        }}
                      />
                    ) : (
                      <div className="rounded-3xl border border-slate-800/60 bg-slate-950/70 p-6">
                        <div className="text-slate-200 font-semibold">No document selected</div>
                        <div className="mt-2 text-slate-400">
                          Create or select a document from the file tree.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>

        {/* Quick Capture (button does not move) */}
        <div ref={qcWrapRef} className="fixed bottom-8 right-8 z-40">
          {qcOpen && (
            <div className="absolute bottom-full right-0 mb-3 w-52 rounded-3xl border border-slate-800/60 bg-slate-950/95 backdrop-blur shadow-2xl overflow-hidden">
              <QCItem label="Quick Note" onClick={() => setQcOpen(false)} />
              <QCItem label="Quick Task" onClick={() => setQcOpen(false)} />
              <QCItem label="Quick Link" onClick={() => setQcOpen(false)} />
            </div>
          )}
          <button
            onClick={() => setQcOpen((v) => !v)}
            className="h-14 w-14 rounded-2xl border border-slate-700/70 bg-slate-950/60 hover:bg-slate-900/70 shadow-xl flex items-center justify-center"
            aria-label="Quick capture"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Name modal */}
      <NameModal
        open={nameModalOpen}
        title={
          nameModalMode === 'rename'
            ? 'Rename'
            : nameModalMode === 'folder'
            ? 'New folder'
            : 'New document'
        }
        initialValue={nameModalMode === 'rename' ? nodes.find((n) => n.id === nameModalTargetId)?.name || '' : ''}
        placeholder={nameModalMode === 'folder' ? 'Folder name' : 'Document name'}
        onClose={() => setNameModalOpen(false)}
        onSubmit={onCreate}
      />

      {/* Context menu */}
      <ContextMenu
        open={!!ctx}
        x={ctx?.x || 0}
        y={ctx?.y || 0}
        items={ctxItems}
        onClose={() => setCtx(null)}
      />
    </div>
  );
}

function NavItem({
  active,
  icon,
  label,
  rightHint,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  rightHint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border transition-colors ${
        active
          ? 'bg-blue-500/18 border-blue-500/30 text-blue-200'
          : 'bg-slate-950/15 border-slate-800/60 text-slate-200 hover:bg-slate-900/35'
      }`}
    >
      <span className="inline-flex items-center gap-3">
        <span className="text-slate-200">{icon}</span>
        <span className="font-medium">{label}</span>
      </span>
      {rightHint ? <span className="text-xs text-slate-400">{rightHint}</span> : null}
    </button>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6 min-h-[520px]">
      <div className="text-2xl font-semibold">{title}</div>
      <div className="mt-2 text-slate-300">This section will be wired up next.</div>
    </div>
  );
}

function QCItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-slate-900/50"
    >
      {label}
    </button>
  );
}
