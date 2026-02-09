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
  X,
} from 'lucide-react';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { PlannerView } from '../components/PlannerView';
import { BoardView } from '../components/BoardView';
import { ResourcesView } from '../components/ResourcesView';
import { OverviewView } from '../components/OverviewView';
import { supabase } from '../lib/supabase';
import { useOrg } from '../hooks/useOrg';
import { useAuth } from '../hooks/useAuth';
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
  tags?: string[] | null;
  created_at?: string;
  updated_at: string;
};

type SearchAction = {
  id: string;
  label: string;
  hint: string;
  run: () => void;
};

type FolderChoice = {
  id: string | null;
  depth: number;
  name: string;
  path: string;
};

function formatQuickNoteName() {
  const d = new Date();
  const time = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s/g, '')
    .toLowerCase();
  const date = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  return `Quick Note ${time} ${date}`;
}

function buildFolderChoices(nodes: FileNode[]): FolderChoice[] {
  const folders = nodes.filter((n) => n.type === 'folder');
  const byParent = new Map<string | null, FileNode[]>();

  for (const folder of folders) {
    const key = folder.parent_id || null;
    const list = byParent.get(key) || [];
    list.push(folder);
    byParent.set(key, list);
  }

  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort_index - b.sort_index || a.name.localeCompare(b.name));
  }

  const out: FolderChoice[] = [{ id: null, depth: 0, name: 'Root', path: '/' }];

  const walk = (parentId: string | null, depth: number, parentPath: string) => {
    const children = byParent.get(parentId) || [];
    for (const child of children) {
      const path = parentPath === '/' ? `/${child.name}` : `${parentPath}/${child.name}`;
      out.push({ id: child.id, depth, name: child.name, path });
      walk(child.id, depth + 1, path);
    }
  };

  walk(null, 1, '/');
  return out;
}

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

function navigateTo(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function ProjectDashboard({
  projectId,
  onBack,
}: {
  projectId?: string;
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const { organization } = useOrg();
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  // Project search (top)
  const [projectSearch, setProjectSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);

  // Project settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsName, setSettingsName] = useState('');
  const [settingsDescription, setSettingsDescription] = useState('');
  const [settingsStatus, setSettingsStatus] = useState('planning');
  const [deleteNameInput, setDeleteNameInput] = useState('');
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);

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
  const [quickNoteModalOpen, setQuickNoteModalOpen] = useState(false);
  const [quickNoteName, setQuickNoteName] = useState('');
  const [quickNoteFolderId, setQuickNoteFolderId] = useState<string | null>(null);
  const [quickNoteFolderName, setQuickNoteFolderName] = useState('');
  const [quickNoteError, setQuickNoteError] = useState<string | null>(null);
  const [quickNoteCreating, setQuickNoteCreating] = useState(false);
  const [quickNoteCreatingFolder, setQuickNoteCreatingFolder] = useState(false);

  const [quickLinkModalOpen, setQuickLinkModalOpen] = useState(false);
  const [quickLinkUrl, setQuickLinkUrl] = useState('');
  const [quickLinkTitle, setQuickLinkTitle] = useState('');
  const [quickLinkDescription, setQuickLinkDescription] = useState('');
  const [quickLinkSaving, setQuickLinkSaving] = useState(false);
  const [quickLinkError, setQuickLinkError] = useState<string | null>(null);

  const [plannerFocusSignal, setPlannerFocusSignal] = useState(0);
  const [highlightResourceId, setHighlightResourceId] = useState<string | null>(null);

  async function loadProject() {
    if (!projectId) {
      setProject(null);
      setProjectError('Missing project id.');
      setProjectLoading(false);
      return;
    }

    if (!user && !organization) {
      setProject(null);
      setProjectError('Sign in required.');
      setProjectLoading(false);
      return;
    }
    setProjectLoading(true);
    setProjectError(null);

    try {
      let query = supabase.from('projects').select('*').eq('id', projectId);

      if (user?.id && organization?.id) {
        query = query.or(`org_id.eq.${organization.id},user_id.eq.${user.id}`);
      } else if (user?.id) {
        query = query.eq('user_id', user.id);
      } else if (organization?.id) {
        query = query.eq('org_id', organization.id);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;

      if (!data) {
        setProject(null);
        setProjectError('Project not found or access denied.');
        return;
      }

      setProject(data as Project);
    } catch (err) {
      setProject(null);
      setProjectError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setProjectLoading(false);
    }
  }

  async function loadFiles() {
    if (!projectId) return;
    setFilesLoading(true);
    setFilesError(null);
    try {
      await ensureDefaultTree(projectId);
      const list = await listNodes(projectId);
      setNodes(list);
      if (!selectedId) {
        const firstDoc = list.find((n) => n.type === 'doc');
        setSelectedId(firstDoc?.id || null);
      }
    } catch (err) {
      setFilesError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setFilesLoading(false);
    }
  }

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, organization?.id, user?.id]);

  useEffect(() => {
    if (!project?.id) return;
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  useEffect(() => {
    setNodes([]);
    setSelectedId(null);
  }, [projectId]);

  useEffect(() => {
    setProjectSearch('');
    setSearchOpen(false);
    setSearchIndex(0);
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
        setSearchOpen(false);
        setSettingsOpen(false);
        setDeleteModalOpen(false);
        setQuickNoteModalOpen(false);
        setQuickLinkModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectedDoc = useMemo(
    () => nodes.find((n) => n.id === selectedId && n.type === 'doc') || null,
    [nodes, selectedId],
  );

  const folderChoices = useMemo(() => buildFolderChoices(nodes), [nodes]);
  const selectedQuickNotePath = useMemo(() => {
    const chosen = folderChoices.find((f) => f.id === quickNoteFolderId);
    return chosen?.path || '/';
  }, [folderChoices, quickNoteFolderId]);

  async function openQuickNoteModal() {
    if (!projectId) return;

    const existing = nodes.find(
      (n) => n.type === 'folder' && n.parent_id === null && n.name.trim().toLowerCase() === 'quick notes',
    );
    let targetFolderId = existing?.id || null;

    if (!targetFolderId) {
      try {
        const created = await createFolder(projectId, 'Quick Notes', null);
        targetFolderId = created.id;
        await loadFiles();
      } catch (err) {
        setQuickNoteError(err instanceof Error ? err.message : 'Failed to create Quick Notes folder.');
        return;
      }
    }

    setQuickNoteError(null);
    setQuickNoteFolderName('');
    setQuickNoteFolderId(targetFolderId);
    setQuickNoteName(formatQuickNoteName());
    setQuickNoteModalOpen(true);
  }

  async function createQuickNoteFolder() {
    if (!projectId) return;
    const name = quickNoteFolderName.trim();
    if (!name) return;

    setQuickNoteCreatingFolder(true);
    setQuickNoteError(null);
    try {
      const created = await createFolder(projectId, name, quickNoteFolderId);
      setQuickNoteFolderName('');
      setQuickNoteFolderId(created.id);
      await loadFiles();
    } catch (err) {
      setQuickNoteError(err instanceof Error ? err.message : 'Failed to create folder.');
    } finally {
      setQuickNoteCreatingFolder(false);
    }
  }

  async function createQuickNoteDoc() {
    if (!projectId) return;
    const name = quickNoteName.trim();
    if (!name) {
      setQuickNoteError('Quick note name is required.');
      return;
    }

    setQuickNoteCreating(true);
    setQuickNoteError(null);
    try {
      const doc = await createDoc(projectId, name, quickNoteFolderId);
      setQuickNoteModalOpen(false);
      setQcOpen(false);
      setTab('files');
      setBranchOpen(true);
      await loadFiles();
      setSelectedId(doc?.id || null);
    } catch (err) {
      setQuickNoteError(err instanceof Error ? err.message : 'Failed to create quick note.');
    } finally {
      setQuickNoteCreating(false);
    }
  }

  async function createQuickLinkResource() {
    if (!projectId) return;
    const url = quickLinkUrl.trim();
    if (!url) {
      setQuickLinkError('Link is required.');
      return;
    }

    setQuickLinkSaving(true);
    setQuickLinkError(null);
    try {
      const basePayload = {
        project_id: projectId,
        url,
        title: quickLinkTitle.trim(),
        description: quickLinkDescription.trim(),
        position: Date.now(),
      };

      let { data, error } = await supabase
        .from('project_resources')
        .insert({ ...basePayload, category: 'quick_links' })
        .select('*')
        .single();

      if (error) {
        const msg = (error as { message?: string }).message || '';
        const code = (error as { code?: string }).code || '';
        const missingQuickLinksCategory =
          code === '23514' ||
          msg.includes('project_resources_category_check') ||
          msg.toLowerCase().includes('check constraint');

        if (missingQuickLinksCategory) {
          const retry = await supabase
            .from('project_resources')
            .insert({ ...basePayload, category: 'other' })
            .select('*')
            .single();

          data = retry.data;
          error = retry.error as typeof error;
        }
      }

      if (error) throw error;

      setQuickLinkModalOpen(false);
      setQcOpen(false);
      setQuickLinkUrl('');
      setQuickLinkTitle('');
      setQuickLinkDescription('');
      setTab('resources');
      setHighlightResourceId((data as { id: string }).id);
    } catch (err) {
      setQuickLinkError(err instanceof Error ? err.message : 'Failed to create quick link.');
    } finally {
      setQuickLinkSaving(false);
    }
  }

  const actionItems: SearchAction[] = [
      {
        id: 'open-settings',
        label: 'Open Settings',
        hint: 'Project',
        run: () => setSettingsOpen(true),
      },
      {
        id: 'open-overview',
        label: 'Open Overview',
        hint: 'Navigate',
        run: () => setTab('overview'),
      },
      {
        id: 'open-boards',
        label: 'Open Boards',
        hint: 'Navigate',
        run: () => setTab('board'),
      },
      {
        id: 'open-planner',
        label: 'Open Planner',
        hint: 'Navigate',
        run: () => setTab('planner'),
      },
      {
        id: 'open-files',
        label: 'Open Files',
        hint: 'Navigate',
        run: () => {
          setTab('files');
          setBranchOpen(true);
        },
      },
      {
        id: 'open-resources',
        label: 'Open Resources',
        hint: 'Navigate',
        run: () => setTab('resources'),
      },
      {
        id: 'create-task',
        label: 'Create New Task',
        hint: 'Planner',
        run: () => {
          setTab('planner');
          setPlannerFocusSignal((v) => v + 1);
        },
      },
      {
        id: 'create-document',
        label: 'Create New Document',
        hint: 'Files',
        run: () => {
          setTab('files');
          setBranchOpen(true);
          setNameModalMode('doc');
          setNameModalParentId(null);
          setNameModalTargetId(null);
          setNameModalOpen(true);
        },
      },
      {
        id: 'create-folder',
        label: 'Create New Folder',
        hint: 'Files',
        run: () => {
          setTab('files');
          setBranchOpen(true);
          setNameModalMode('folder');
          setNameModalParentId(null);
          setNameModalTargetId(null);
          setNameModalOpen(true);
        },
      },
      {
        id: 'quick-note',
        label: 'Capture Quick Note',
        hint: 'Capture',
        run: () => {
          setQcOpen(false);
          void openQuickNoteModal();
        },
      },
      {
        id: 'quick-link',
        label: 'Capture Quick Link',
        hint: 'Capture',
        run: () => {
          setQcOpen(false);
          setQuickLinkError(null);
          setQuickLinkUrl('');
          setQuickLinkTitle('');
          setQuickLinkDescription('');
          setQuickLinkModalOpen(true);
        },
      },
    ];

  const searchResults = (() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return [] as SearchAction[];
    return actionItems
      .filter((action) => `${action.label} ${action.hint}`.toLowerCase().includes(q))
      .slice(0, 10);
  })();

  useEffect(() => {
    if (!projectSearch.trim()) {
      setSearchOpen(false);
      setSearchIndex(0);
    } else {
      setSearchIndex(0);
    }
  }, [projectSearch]);

  useEffect(() => {
    if (!searchResults.length) {
      setSearchIndex(0);
      return;
    }
    setSearchIndex((i) => Math.min(i, Math.max(0, searchResults.length - 1)));
  }, [searchResults.length]);

  useEffect(() => {
    if (!settingsOpen || !project) return;
    setSettingsError(null);
    setSettingsName(project.name || '');
    setSettingsDescription(project.description || '');
    setSettingsStatus(clampStatus(project.status || 'planning'));
  }, [settingsOpen, project]);

  useEffect(() => {
    if (!deleteModalOpen || !project) return;
    setDeleteNameInput('');
    setDeleteConfirmChecked(false);
    setDeleteError(null);
  }, [deleteModalOpen, project]);

  async function saveProjectSettings() {
    if (!projectId || !project) return;
    const trimmedName = settingsName.trim();
    if (!trimmedName) {
      setSettingsError('Project name is required.');
      return;
    }

    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const { data, error } = await supabase
        .from('projects')
        .update({
          name: trimmedName,
          description: settingsDescription.trim(),
          status: clampStatus(settingsStatus),
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .select('*')
        .single();
      if (error) throw error;

      setProject(data as Project);
      setSettingsOpen(false);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to save project settings.');
    } finally {
      setSettingsSaving(false);
    }
  }

  async function deleteProject() {
    if (!projectId || !project) return;

    if (deleteNameInput.trim() !== project.name) {
      setDeleteError('Project name does not match.');
      return;
    }

    if (!deleteConfirmChecked) {
      setDeleteError('Please confirm that this action cannot be undone.');
      return;
    }

    setDeletingProject(true);
    setDeleteError(null);
    try {
      const { error } = await supabase.from('projects').delete().eq('id', projectId);
      if (error) throw error;
      setDeleteModalOpen(false);
      setSettingsOpen(false);
      navigateTo('/projects');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete project.');
    } finally {
      setDeletingProject(false);
    }
  }

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

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigateTo('/projects');
    }
  };

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="rounded-full h-12 w-12 border-2 border-blue-500/60 mx-auto mb-4" />
          <p className="text-slate-300">Loading project…</p>
        </div>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900/70 border border-slate-800/60 rounded-2xl p-6 text-center">
          <div className="text-xl font-semibold text-white">Project unavailable</div>
          <div className="mt-2 text-sm text-slate-400">
            {projectError || 'This project could not be loaded.'}
          </div>
          <button
            onClick={handleBack}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-slate-800/60 bg-slate-900/40 hover:bg-slate-900/55 text-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white relative overflow-hidden">
      <AnimatedBackground />
      {/* readability veil (keeps text readable vs the animation) */}
      <div className="absolute inset-0 bg-slate-950/45" />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="relative z-30 border-b border-slate-800/50 bg-slate-950/75 backdrop-blur">
          <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex flex-wrap items-center justify-between gap-3 sm:gap-6">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <button
                onClick={handleBack}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl border border-slate-800/60 bg-slate-900/25 hover:bg-slate-900/45 transition-colors shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium hidden sm:inline">Back to Projects</span>
              </button>

              <div className="min-w-0">
                <div className="text-lg font-semibold truncate">{project?.name || 'Project'}</div>
                <div className="text-sm text-slate-300 flex flex-wrap items-center gap-2 sm:gap-3">
                  <span
                    className={`px-2.5 py-1 rounded-2xl border text-xs ${statusPill(
                      project?.status || 'planning',
                    )}`}
                  >
                    {clampStatus(project?.status || 'planning')}
                  </span>
                  <span className="text-slate-400 whitespace-nowrap">Updated {formatRelative(project?.updated_at)}</span>
                </div>
              </div>
            </div>

            <div className="order-3 w-full lg:order-none lg:flex-1 flex justify-center">
              <div className="w-full lg:w-[680px] lg:max-w-[60vw] relative">
                <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  ref={projectSearchRef}
                  value={projectSearch}
                  onChange={(e) => {
                    setProjectSearch(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(!!projectSearch.trim())}
                  onBlur={() => {
                    window.setTimeout(() => setSearchOpen(false), 150);
                  }}
                  onKeyDown={(e) => {
                    if (!searchResults.length) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSearchOpen(true);
                      setSearchIndex((i) => Math.min(i + 1, searchResults.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSearchOpen(true);
                      setSearchIndex((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const chosen = searchResults[searchIndex];
                      if (chosen) {
                        setSearchOpen(false);
                        chosen.run();
                      }
                    } else if (e.key === 'Escape') {
                      setSearchOpen(false);
                    }
                  }}
                  placeholder="Search actions in this project..."
                  className="w-full pl-12 pr-16 py-3 rounded-2xl bg-slate-950/50 border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <div className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 border border-slate-700/70 rounded-xl px-2.5 py-1">
                  Ctrl K
                </div>
                {searchOpen && !!projectSearch.trim() && (
                  <div className="absolute left-0 right-0 mt-2 z-50 rounded-2xl border border-slate-800/60 bg-slate-950/95 backdrop-blur shadow-xl overflow-hidden">
                    {searchResults.length > 0 ? (
                      searchResults.map((action, idx) => {
                        const active = idx === searchIndex;
                        return (
                          <button
                            key={action.id}
                            onMouseEnter={() => setSearchIndex(idx)}
                            onClick={() => {
                              setSearchOpen(false);
                              action.run();
                            }}
                            className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                              active ? 'bg-slate-900/60' : 'hover:bg-slate-900/40'
                            }`}
                          >
                            <span className="text-sm font-semibold text-slate-100 truncate">
                              {action.label}
                            </span>
                            <span className="text-xs text-slate-400 whitespace-nowrap">{action.hint}</span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-400">No matching actions.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="hidden lg:flex w-[240px] justify-end">{/* empty */}</div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
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
                      setSettingsOpen(true);
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
                <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-4 h-auto lg:h-[calc(100vh-220px)] min-h-[420px] lg:min-h-[520px] flex flex-col">
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

                  <div className="mt-4 flex flex-wrap items-center gap-2">
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

                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45 cursor-pointer lg:ml-auto">
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
                    {filesLoading && <div className="text-xs text-slate-400 mb-2">Loading files…</div>}
                    {filesError && <div className="text-xs text-red-400 mb-2">{filesError}</div>}
                    <FileTreePanel
                      storageKey={`project-files-open:${projectId || 'unknown'}`}
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
              {tab === 'planner' && projectId && (
                <PlannerView projectId={projectId} focusNewTaskSignal={plannerFocusSignal} />
              )}
              {tab === 'resources' && projectId && (
                <ResourcesView
                  projectId={projectId}
                  highlightResourceId={highlightResourceId}
                  onHighlightConsumed={() => setHighlightResourceId(null)}
                />
              )}

              {tab === 'files' && (
                <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6 min-h-[380px] sm:min-h-[520px]">
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
                        onSaved={() => {
                          setProject((prev) =>
                            prev ? { ...prev, updated_at: new Date().toISOString() } : prev,
                          );
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
        <div ref={qcWrapRef} className="fixed bottom-5 right-5 sm:bottom-8 sm:right-8 z-40">
          {qcOpen && (
            <div className="absolute bottom-full right-0 mb-3 w-52 rounded-3xl border border-slate-800/60 bg-slate-950/95 backdrop-blur shadow-2xl overflow-hidden">
              <QCItem
                label="Quick Note"
                onClick={() => {
                  setQcOpen(false);
                  void openQuickNoteModal();
                }}
              />
              <QCItem
                label="Quick Task"
                onClick={() => {
                  setQcOpen(false);
                  setTab('planner');
                  setPlannerFocusSignal((v) => v + 1);
                }}
              />
              <QCItem
                label="Quick Link"
                onClick={() => {
                  setQcOpen(false);
                  setQuickLinkError(null);
                  setQuickLinkUrl('');
                  setQuickLinkTitle('');
                  setQuickLinkDescription('');
                  setQuickLinkModalOpen(true);
                }}
              />
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

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <button
            className="absolute inset-0 bg-black/55"
            onClick={() => {
              setDeleteModalOpen(false);
              setSettingsOpen(false);
            }}
            aria-label="Close"
          />
          <div className="relative w-[760px] max-w-[92vw] rounded-3xl border border-slate-800/60 bg-slate-950/90 backdrop-blur p-4 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold">Project settings</div>
                <div className="mt-1 text-slate-300">Manage details for this project.</div>
              </div>
              <button
                onClick={() => {
                  setDeleteModalOpen(false);
                  setSettingsOpen(false);
                }}
                className="p-2 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-slate-300 mb-2">Project name</div>
                <input
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                  placeholder="Project name"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950/40 border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div>
                <div className="text-sm text-slate-300 mb-2">Status</div>
                <select
                  value={settingsStatus}
                  onChange={(e) => setSettingsStatus(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950/40 border border-slate-800/60 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="review">Review</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-sm text-slate-300 mb-2">Description</div>
              <textarea
                value={settingsDescription}
                onChange={(e) => setSettingsDescription(e.target.value)}
                placeholder="What is this project about?"
                rows={5}
                className="w-full px-4 py-3 rounded-2xl bg-slate-950/40 border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
              />
            </div>

            {settingsError && (
              <div className="mt-4 p-3 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
                {settingsError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setDeleteModalOpen(false);
                  setSettingsOpen(false);
                }}
                className="px-4 py-3 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
              >
                Cancel
              </button>
              <button
                onClick={saveProjectSettings}
                disabled={settingsSaving || !settingsName.trim()}
                className={`px-4 py-3 rounded-2xl border transition-colors ${
                  settingsName.trim() && !settingsSaving
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-200 hover:bg-blue-500/25'
                    : 'bg-slate-900/20 border-slate-800/60 text-slate-500 cursor-not-allowed'
                }`}
              >
                {settingsSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800/60">
              <button
                onClick={() => setDeleteModalOpen(true)}
                className="px-4 py-3 rounded-2xl border border-red-500/35 bg-red-500/10 hover:bg-red-500/15 text-red-200 transition-colors"
              >
                Delete Project...
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
          <button
            className="absolute inset-0 bg-black/65"
            onClick={() => setDeleteModalOpen(false)}
            aria-label="Close"
          />
          <div className="relative w-[640px] max-w-[92vw] rounded-3xl border border-red-500/30 bg-slate-950/95 backdrop-blur p-4 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold text-red-200">Delete project</div>
                <div className="mt-1 text-slate-300">
                  This permanently deletes project data and cannot be undone.
                </div>
              </div>
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="p-2 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5">
              <div className="text-sm text-slate-300 mb-2">
                Type <span className="font-semibold text-slate-100">{project.name}</span> to confirm
              </div>
              <input
                value={deleteNameInput}
                onChange={(e) => {
                  setDeleteNameInput(e.target.value);
                  setDeleteError(null);
                }}
                placeholder="Enter project name"
                className="w-full px-4 py-3 rounded-2xl bg-slate-950/40 border border-red-500/25 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
            </div>

            <label className="mt-4 inline-flex items-start gap-3 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteConfirmChecked}
                onChange={(e) => {
                  setDeleteConfirmChecked(e.target.checked);
                  setDeleteError(null);
                }}
                className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-red-500 focus:ring-red-500/40"
              />
              <span>I understand this action cannot be undone.</span>
            </label>

            {deleteError && (
              <div className="mt-4 p-3 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
                {deleteError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-3 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
              >
                Cancel
              </button>
              <button
                onClick={deleteProject}
                disabled={deletingProject || deleteNameInput.trim() !== project.name || !deleteConfirmChecked}
                className={`px-4 py-3 rounded-2xl border transition-colors ${
                  !deletingProject && deleteNameInput.trim() === project.name && deleteConfirmChecked
                    ? 'bg-red-500/20 border-red-500/40 text-red-200 hover:bg-red-500/25'
                    : 'bg-slate-900/20 border-slate-800/60 text-slate-500 cursor-not-allowed'
                }`}
              >
                {deletingProject ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {quickNoteModalOpen && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 sm:p-6">
          <button
            className="absolute inset-0 bg-black/60"
            onClick={() => setQuickNoteModalOpen(false)}
            aria-label="Close"
          />
          <div className="relative w-[860px] max-w-[96vw] rounded-3xl border border-slate-800/60 bg-slate-950/95 backdrop-blur p-4 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold">Create quick note</div>
                <div className="mt-1 text-slate-300">
                  Choose where to save it, then open it immediately in Files.
                </div>
              </div>
              <button
                onClick={() => setQuickNoteModalOpen(false)}
                className="p-2 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-2xl border border-slate-800/60 bg-slate-950/45 p-4">
                <div className="text-sm font-medium text-slate-200 mb-3">Choose folder</div>
                <div className="max-h-[300px] overflow-auto rounded-xl border border-slate-800/60 bg-slate-950/35 p-2">
                  {folderChoices.map((folder) => {
                    const active = folder.id === quickNoteFolderId;
                    return (
                      <button
                        key={folder.id || 'root'}
                        onClick={() => setQuickNoteFolderId(folder.id)}
                        className={`w-full text-left px-3 py-2 rounded-xl transition-colors ${
                          active ? 'bg-blue-500/18 border border-blue-500/30 text-blue-200' : 'hover:bg-slate-900/45 text-slate-200'
                        }`}
                        style={{ paddingLeft: `${12 + folder.depth * 14}px` }}
                      >
                        {folder.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800/60 bg-slate-950/45 p-4">
                <div className="text-sm font-medium text-slate-200 mb-3">Create folder</div>
                <div className="flex items-center gap-2">
                  <input
                    value={quickNoteFolderName}
                    onChange={(e) => {
                      setQuickNoteFolderName(e.target.value);
                      setQuickNoteError(null);
                    }}
                    placeholder="New folder name"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
                  />
                  <button
                    onClick={createQuickNoteFolder}
                    disabled={quickNoteCreatingFolder || !quickNoteFolderName.trim()}
                    className={`px-3 py-2.5 rounded-xl border transition-colors ${
                      quickNoteFolderName.trim() && !quickNoteCreatingFolder
                        ? 'bg-blue-500/20 border-blue-500/30 text-blue-200 hover:bg-blue-500/25'
                        : 'bg-slate-900/20 border-slate-800/60 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {quickNoteCreatingFolder ? 'Creating...' : 'New Folder'}
                  </button>
                </div>

                <div className="mt-4">
                  <div className="text-sm text-slate-300 mb-2">File name</div>
                  <input
                    value={quickNoteName}
                    onChange={(e) => {
                      setQuickNoteName(e.target.value);
                      setQuickNoteError(null);
                    }}
                    placeholder="Quick note name"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-950/60 border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
                  />
                </div>

                <div className="mt-3 text-sm text-slate-400">
                  Save path: <span className="text-slate-200">{selectedQuickNotePath}</span>
                </div>
              </div>
            </div>

            {quickNoteError && (
              <div className="mt-4 p-3 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
                {quickNoteError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setQuickNoteModalOpen(false)}
                className="px-4 py-3 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
              >
                Cancel
              </button>
              <button
                onClick={createQuickNoteDoc}
                disabled={quickNoteCreating || !quickNoteName.trim()}
                className={`px-4 py-3 rounded-2xl border transition-colors ${
                  quickNoteName.trim() && !quickNoteCreating
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-200 hover:bg-blue-500/25'
                    : 'bg-slate-900/20 border-slate-800/60 text-slate-500 cursor-not-allowed'
                }`}
              >
                {quickNoteCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {quickLinkModalOpen && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 sm:p-6">
          <button
            className="absolute inset-0 bg-black/60"
            onClick={() => setQuickLinkModalOpen(false)}
            aria-label="Close"
          />
          <div className="relative w-[620px] max-w-[96vw] rounded-3xl border border-slate-800/60 bg-slate-950/95 backdrop-blur p-4 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold">Quick link</div>
                <div className="mt-1 text-slate-300">Adds a resource in the Quick Links category.</div>
              </div>
              <button
                onClick={() => setQuickLinkModalOpen(false)}
                className="p-2 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <div className="text-sm text-slate-300 mb-2">Link</div>
                <input
                  value={quickLinkUrl}
                  onChange={(e) => {
                    setQuickLinkUrl(e.target.value);
                    setQuickLinkError(null);
                  }}
                  placeholder="https://..."
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950/60 border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
                />
              </div>
              <div>
                <div className="text-sm text-slate-300 mb-2">Name (optional)</div>
                <input
                  value={quickLinkTitle}
                  onChange={(e) => {
                    setQuickLinkTitle(e.target.value);
                    setQuickLinkError(null);
                  }}
                  placeholder="Optional title"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950/60 border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
                />
              </div>
              <div>
                <div className="text-sm text-slate-300 mb-2">Description (optional)</div>
                <textarea
                  value={quickLinkDescription}
                  onChange={(e) => {
                    setQuickLinkDescription(e.target.value);
                    setQuickLinkError(null);
                  }}
                  rows={4}
                  placeholder="Optional description"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950/60 border border-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/35 resize-none"
                />
              </div>
            </div>

            {quickLinkError && (
              <div className="mt-4 p-3 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
                {quickLinkError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setQuickLinkModalOpen(false)}
                className="px-4 py-3 rounded-2xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45"
              >
                Cancel
              </button>
              <button
                onClick={createQuickLinkResource}
                disabled={quickLinkSaving || !quickLinkUrl.trim()}
                className={`px-4 py-3 rounded-2xl border transition-colors ${
                  quickLinkUrl.trim() && !quickLinkSaving
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-200 hover:bg-blue-500/25'
                    : 'bg-slate-900/20 border-slate-800/60 text-slate-500 cursor-not-allowed'
                }`}
              >
                {quickLinkSaving ? 'Adding...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
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
