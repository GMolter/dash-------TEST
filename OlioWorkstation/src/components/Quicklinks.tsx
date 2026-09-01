import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Folder,
  FolderOpen,
  Globe2,
  GripVertical,
  Layers3,
  Link2,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../hooks/useOrg';
import { useAuth } from '../hooks/useAuth';
import { usePermission } from '../hooks/usePermission';

interface Quicklink {
  id: string;
  title: string;
  url: string;
  icon: string;
  order_index: number;
  scope: 'personal' | 'shared' | 'both';
  user_id: string;
  folder_id?: string | null;
}

interface QuicklinkFolder {
  id: string;
  name: string;
  icon: string;
  order_index: number;
  scope?: 'personal' | 'shared' | 'both';
  user_id?: string;
}

type QuicklinksCache = {
  links: Quicklink[];
  folders: QuicklinkFolder[];
};

const QUICKLINKS_CACHE_PREFIX = 'olio-quicklinks-v1';

function quicklinksCacheKey(userId: string) {
  return `${QUICKLINKS_CACHE_PREFIX}:${userId}`;
}

function readQuicklinksCache(userId: string): QuicklinksCache | null {
  try {
    const raw = window.localStorage.getItem(quicklinksCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QuicklinksCache>;
    if (!Array.isArray(parsed.links) || !Array.isArray(parsed.folders)) return null;
    return {
      links: parsed.links as Quicklink[],
      folders: parsed.folders as QuicklinkFolder[],
    };
  } catch {
    return null;
  }
}

function writeQuicklinksCache(userId: string, links: Quicklink[], folders: QuicklinkFolder[]) {
  try {
    window.localStorage.setItem(
      quicklinksCacheKey(userId),
      JSON.stringify({ links, folders } satisfies QuicklinksCache),
    );
  } catch {
    // The live data remains authoritative when local storage is unavailable.
  }
}

type GridItem =
  | { itemType: 'folder'; id: string; order_index: number; data: QuicklinkFolder }
  | { itemType: 'link'; id: string; order_index: number; data: Quicklink };

interface Props {
  editMode?: boolean;
  collection?: 'personal' | 'shared';
}

export function Quicklinks({ editMode = false, collection = 'personal' }: Props) {
  const { user } = useAuth();
  const { organization } = useOrg();
  const { canManageOrg } = usePermission();

  // ── Data ─────────────────────────────────────────────────────────────────────
  const [links, setLinks] = useState<Quicklink[]>([]);
  const [folders, setFolders] = useState<QuicklinkFolder[]>([]);
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);

  // ── Link form ────────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingLink, setEditingLink] = useState<Quicklink | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('🔗');
  const [linkFolderId, setLinkFolderId] = useState<string>('');

  // ── Folder form ──────────────────────────────────────────────────────────────
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [editingFolder, setEditingFolder] = useState<QuicklinkFolder | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderIcon, setFolderIcon] = useState('📁');
  const [showIconPicker, setShowIconPicker] = useState(false);

  const FOLDER_ICONS = [
    '📁','📂','🗂️','💼','📚','🎯','🚀','⭐','🔧','💻',
    '🎮','🎨','🏠','📝','🔖','📦','🌐','❤️','🔒','🎵',
    '🎬','📸','🧪','🛠️','⚡','🌟','🔑','📊','🎓','🏆',
    '🧠','🗺️','🌈','🔥','💡','🎁','🧩','📡','🏋️','✈️',
  ];

  // ── Delete modals ────────────────────────────────────────────────────────────
  const [linkToDelete, setLinkToDelete] = useState<Quicklink | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<QuicklinkFolder | null>(null);

  // ── Drag state ───────────────────────────────────────────────────────────────
  const [dragging, setDragging] = useState<{ id: string; itemType: 'folder' | 'link' } | null>(null);
  // side: 'before' | 'after' = insert indicator line; 'into' = drop into folder
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'before' | 'after' | 'into' } | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingFolderItem, setDraggingFolderItem] = useState<string | null>(null);
  const [dragOverFolderItemId, setDragOverFolderItemId] = useState<string | null>(null);
  const [isMobileFolderView, setIsMobileFolderView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  // ── Computed ─────────────────────────────────────────────────────────────────
  const collectionLinks = collection === 'shared'
    ? links.filter((link) => link.scope === 'shared' || link.scope === 'both')
    : links.filter((link) => link.user_id === user?.id && (link.scope === 'personal' || link.scope === 'both'));
  const collectionFolders = collection === 'personal'
    ? folders.filter((folder) => folder.user_id === user?.id && (!folder.scope || folder.scope === 'personal' || folder.scope === 'both'))
    : [];
  const linksInFolder = (folderId: string) => collectionLinks.filter((link) => link.folder_id === folderId);

  // Shared links are intentionally flat. This also keeps legacy shared links visible
  // if they were previously assigned to a personal folder.
  const rootLinksForGrid = collection === 'shared'
    ? collectionLinks
    : collectionLinks.filter((link) => !link.folder_id);

  const allGridItems: GridItem[] = [
    ...collectionFolders.map((f) => ({ itemType: 'folder' as const, id: f.id, order_index: f.order_index, data: f })),
    ...rootLinksForGrid.map((l) => ({ itemType: 'link' as const, id: l.id, order_index: l.order_index, data: l })),
  ].sort((a, b) => a.order_index - b.order_index);

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) {
      setLinks([]);
      setFolders([]);
      return;
    }

    const userId = user.id;
    const cached = readQuicklinksCache(userId);
    if (cached) {
      setLinks(cached.links);
      setFolders(cached.folders);
    }

    let cancelled = false;

    async function refreshQuicklinks() {
      const [linksResult, foldersResult] = await Promise.all([
        supabase.from('quicklinks').select('*').order('order_index', { ascending: true }),
        supabase.from('quicklink_folders').select('*').order('order_index', { ascending: true }),
      ]);
      if (cancelled) return;

      const nextLinks = !linksResult.error && linksResult.data
        ? linksResult.data as Quicklink[]
        : cached?.links ?? [];
      const nextFolders = !foldersResult.error && foldersResult.data
        ? foldersResult.data as QuicklinkFolder[]
        : cached?.folders ?? [];

      setLinks(nextLinks);
      setFolders(nextFolders);
      if (!linksResult.error && !foldersResult.error) {
        writeQuicklinksCache(userId, nextLinks, nextFolders);
      }
    }

    void refreshQuicklinks();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobileFolderView(media.matches);

    sync();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }

    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!expandedFolderId || editMode) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [editMode, expandedFolderId, isMobileFolderView]);

  const loadLinks = async () => {
    const { data, error } = await supabase.from('quicklinks').select('*').order('order_index', { ascending: true });
    if (!error && data) {
      const nextLinks = data as Quicklink[];
      setLinks(nextLinks);
      if (user?.id) writeQuicklinksCache(user.id, nextLinks, folders);
    }
  };

  const loadFolders = async () => {
    const { data, error } = await supabase.from('quicklink_folders').select('*').order('order_index', { ascending: true });
    if (!error && data) {
      const nextFolders = data as QuicklinkFolder[];
      setFolders(nextFolders);
      if (user?.id) writeQuicklinksCache(user.id, links, nextFolders);
    }
  };

  // ── URL helpers ───────────────────────────────────────────────────────────────
  const looksLikeUrl = (value: string) => {
    const v = (value || '').trim();
    return v.startsWith('http://') || v.startsWith('https://');
  };

  const formatUrl = (raw: string) => {
    const u = (raw || '').trim();
    if (!u) return u;
    return u.startsWith('http://') || u.startsWith('https://') ? u : 'https://' + u;
  };

  const faviconFor = (rawUrl: string) => {
    try {
      const u = new URL(formatUrl(rawUrl));
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=64`;
    } catch { return ''; }
  };

  const hostnameFor = (rawUrl: string) => {
    try {
      return new URL(formatUrl(rawUrl)).hostname.replace(/^www\./, '');
    } catch {
      return rawUrl || 'No URL';
    }
  };

  // ── FolderIcon ────────────────────────────────────────────────────────────────
  const FolderIcon = ({ icon, size = 40 }: { icon: string; size?: number }) => {
    const isUrl = (icon || '').trim().startsWith('http://') || (icon || '').trim().startsWith('https://');
    const [imgOk, setImgOk] = useState(isUrl);
    if (isUrl && imgOk) {
      return <img src={icon.trim()} alt="" width={size} height={size} className="rounded-md" onError={() => setImgOk(false)} />;
    }
    return <span className="leading-none" style={{ fontSize: Math.round(size * 0.9) }}>{icon || '📁'}</span>;
  };

  // ── LinkIcon ──────────────────────────────────────────────────────────────────
  const LinkIcon = ({ link, size = 40 }: { link: Quicklink; size?: number }) => {
    const customImg = looksLikeUrl(link.icon) ? link.icon.trim() : '';
    const fallbackEmoji = !looksLikeUrl(link.icon) && (link.icon || '').trim() ? link.icon : '🔗';
    const favicon = faviconFor(link.url);
    const primarySrc = customImg || favicon;
    const [imgOk, setImgOk] = useState(!!primarySrc);

    if (primarySrc && imgOk) {
      return (
        <img src={primarySrc} alt="" width={size} height={size} className="rounded-md" onError={() => setImgOk(false)} />
      );
    }
    return <span className="leading-none" style={{ fontSize: Math.round(size * 0.9) }}>{fallbackEmoji}</span>;
  };

  // ── Link CRUD ─────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setTitle(''); setUrl(''); setIcon('🔗'); setLinkFolderId('');
    setShowForm(false); setEditingLink(null);
  };

  const addLink = async () => {
    if (!title || !url || !organization || !user) return;
    const { error } = await supabase.from('quicklinks').insert({
      title, url, icon, order_index: links.length,
      org_id: organization.id, user_id: user.id, scope: collection, folder_id: collection === 'personal' ? linkFolderId || null : null,
    });
    if (!error) { resetForm(); loadLinks(); }
  };

  const updateLink = async () => {
    if (!editingLink || !title || !url) return;
    const { error } = await supabase.from('quicklinks')
      .update({ title, url, icon, scope: collection, folder_id: collection === 'personal' ? linkFolderId || null : null })
      .eq('id', editingLink.id);
    if (!error) { resetForm(); loadLinks(); }
  };

  const deleteLink = async () => {
    if (!linkToDelete) return;
    const { error } = await supabase.from('quicklinks').delete().eq('id', linkToDelete.id);
    if (!error) { setLinkToDelete(null); loadLinks(); }
  };

  const startEditLink = (link: Quicklink) => {
    setEditingLink(link); setTitle(link.title); setUrl(link.url);
    setIcon(link.icon || '🔗');
    setLinkFolderId(collection === 'personal' ? link.folder_id || '' : ''); setShowForm(true);
  };

  // ── Folder CRUD ───────────────────────────────────────────────────────────────
  const resetFolderForm = () => {
    setFolderName(''); setFolderIcon('📁'); setShowFolderForm(false); setEditingFolder(null); setShowIconPicker(false);
  };

  const addFolder = async () => {
    if (!folderName || !organization || !user) return;
    const { error } = await supabase.from('quicklink_folders').insert({
      name: folderName, icon: folderIcon,
      order_index: allGridItems.length,
      org_id: organization.id, user_id: user.id,
    });
    if (!error) { resetFolderForm(); loadFolders(); }
  };

  const updateFolder = async () => {
    if (!editingFolder || !folderName) return;
    const { error } = await supabase.from('quicklink_folders')
      .update({ name: folderName, icon: folderIcon })
      .eq('id', editingFolder.id);
    if (!error) { resetFolderForm(); loadFolders(); }
  };

  const startEditFolder = (folder: QuicklinkFolder) => {
    setEditingFolder(folder); setFolderName(folder.name); setFolderIcon(folder.icon || '📁');
    setShowFolderForm(true);
  };

  const deleteFolder = async (strategy: 'root' | 'delete') => {
    if (!folderToDelete) return;
    if (strategy === 'root') {
      await supabase.from('quicklinks').update({ folder_id: null }).eq('folder_id', folderToDelete.id);
    } else {
      await supabase.from('quicklinks').delete().eq('folder_id', folderToDelete.id);
    }
    await supabase.from('quicklink_folders').delete().eq('id', folderToDelete.id);
    if (expandedFolderId === folderToDelete.id) setExpandedFolderId(null);
    setFolderToDelete(null);
    loadLinks(); loadFolders();
  };

  // ── Drag & drop ───────────────────────────────────────────────────────────────
  const moveItem = <T,>(arr: T[], from: number, to: number): T[] => {
    const copy = [...arr];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  };

  const persistUnifiedOrder = async (reordered: GridItem[]) => {
    setSavingOrder(true);
    const newIndexMap = new Map(reordered.map((item, idx) => [item.id, idx]));
    setFolders((prev) => prev.map((f) => ({ ...f, order_index: newIndexMap.get(f.id) ?? f.order_index })));
    setLinks((prev) => prev.map((l) => ({ ...l, order_index: newIndexMap.get(l.id) ?? l.order_index })));
    try {
      await Promise.all(
        reordered.map((item, idx) =>
          supabase.from(item.itemType === 'folder' ? 'quicklink_folders' : 'quicklinks')
            .update({ order_index: idx }).eq('id', item.id)
        )
      );
    } catch {
      loadLinks(); loadFolders();
    } finally {
      setSavingOrder(false);
    }
  };

  const onDragStart = (id: string, itemType: 'folder' | 'link') => (e: React.DragEvent) => {
    setDragging({ id, itemType });
    setDropTarget(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${itemType}:${id}`);
    try { e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, 0, 0); } catch {
      // Some browsers do not support a custom drag image.
    }
  };

  const onDragOver = (id: string, targetItemType: 'folder' | 'link') => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = (e.clientY - rect.top) / rect.height;
    if (dragging?.itemType === 'link' && targetItemType === 'folder' && relY > 0.25 && relY < 0.75) {
      setDropTarget({ id, side: 'into' });
    } else {
      setDropTarget({ id, side: relY < 0.5 ? 'before' : 'after' });
    }
  };

  const onDropOn = (targetId: string, targetItemType: 'folder' | 'link') => async (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    const dragId = dragging?.id ?? raw.split(':')[1];
    const dragItemType = dragging?.itemType ?? (raw.split(':')[0] as 'folder' | 'link');
    const side = dropTarget?.side ?? 'after';

    setDragging(null); setDropTarget(null);
    if (!dragId || dragId === targetId) return;

    // Drop link INTO folder center
    if (side === 'into' && targetItemType === 'folder' && dragItemType === 'link') {
      setLinks((prev) => prev.map((l) => l.id === dragId ? { ...l, folder_id: targetId } : l));
      await supabase.from('quicklinks').update({ folder_id: targetId }).eq('id', dragId);
      return;
    }

    // Reorder: insert before or after target
    const fromIdx = allGridItems.findIndex((i) => i.id === dragId);
    const toIdx = allGridItems.findIndex((i) => i.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;

    const items = [...allGridItems];
    const [removed] = items.splice(fromIdx, 1);
    const insertAt = side === 'before' ? toIdx : toIdx + 1;
    const adjusted = insertAt > fromIdx ? insertAt - 1 : insertAt;
    items.splice(adjusted, 0, removed);

    await persistUnifiedOrder(items);
  };

  const onDragEnd = () => { setDragging(null); setDropTarget(null); };

  // ── Folder-item reorder ───────────────────────────────────────────────────────
  const persistFolderOrder = async (reordered: Quicklink[]) => {
    setLinks((prev) => prev.map((l) => {
      const idx = reordered.findIndex((r) => r.id === l.id);
      return idx >= 0 ? { ...l, order_index: idx } : l;
    }));
    await Promise.all(reordered.map((l, idx) =>
      supabase.from('quicklinks').update({ order_index: idx }).eq('id', l.id)
    ));
  };

  const onFolderItemDragStart = (linkId: string) => (e: React.DragEvent) => {
    setDraggingFolderItem(linkId);
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  };

  const onFolderItemDragOver = (linkId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderItemId(linkId);
  };

  const onFolderItemDrop = (folderId: string, targetId: string) => async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dragId = draggingFolderItem;
    setDraggingFolderItem(null);
    setDragOverFolderItemId(null);
    if (!dragId || dragId === targetId) return;
    const folderLinks = collectionLinks.filter((l) => l.folder_id === folderId).sort((a, b) => a.order_index - b.order_index);
    const fromIdx = folderLinks.findIndex((l) => l.id === dragId);
    const toIdx = folderLinks.findIndex((l) => l.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    await persistFolderOrder(moveItem(folderLinks, fromIdx, toIdx));
  };

  const onFolderItemDragEnd = () => { setDraggingFolderItem(null); setDragOverFolderItemId(null); };

  // ── Shared tile classes ───────────────────────────────────────────────────────
  const tileBase = 'glass-panel group relative flex min-h-[11.5rem] flex-col items-center justify-center overflow-hidden rounded-[1.4rem] p-5 text-center transition-all duration-300 sm:min-h-[12rem] lg:min-h-[12.5rem] hover:-translate-y-1 hover:border-indigo-300/30 hover:bg-slate-900/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.11),0_24px_60px_rgba(49,46,129,0.18)]';
  const focusedFolder = expandedFolderId ? collectionFolders.find((folder) => folder.id === expandedFolderId) || null : null;
  const focusedFolderLinks = focusedFolder
    ? linksInFolder(focusedFolder.id).sort((a, b) => a.order_index - b.order_index)
    : [];

  const toggleFolderOpen = (folderId: string) => {
    setExpandedFolderId((current) => current === folderId ? null : folderId);
  };

  const folderOverlay = focusedFolder && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[160] px-4 py-6 sm:px-6 sm:py-10 bg-slate-950/72 backdrop-blur-md"
          onClick={() => setExpandedFolderId(null)}
        >
          <div className="mx-auto flex h-full max-w-5xl items-center justify-center">
            <div
              className="glass-panel ql-folder-focus w-full rounded-[2rem] bg-slate-950/75 p-5 sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                  <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-800/85">
                    <FolderIcon icon={focusedFolder.icon} size={isMobileFolderView ? 28 : 34} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-lg sm:text-2xl font-semibold text-white">{focusedFolder.name}</div>
                    <div className="text-sm sm:text-base text-slate-400">
                      {focusedFolderLinks.length} link{focusedFolderLinks.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedFolderId(null)}
                  className="rounded-full border border-slate-700/70 bg-slate-800/80 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-200"
                >
                  Close
                </button>
              </div>

              {focusedFolderLinks.length > 0 ? (
                <div className="max-h-[min(68vh,40rem)] overflow-y-auto pr-1 sm:pr-2 scrollbar-theme">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                    {focusedFolderLinks.map((link, i) => (
                      <a
                        key={link.id}
                        href={formatUrl(link.url)}
                        className="ql-pop-in rounded-2xl sm:rounded-[1.4rem] border border-slate-700/60 bg-slate-800/78 px-3 py-6 sm:px-4 sm:py-7 text-center hover:bg-slate-700/78 min-h-[9.75rem] sm:min-h-[11rem]"
                        style={{ animationDelay: `${i * 36}ms` }}
                      >
                        <div className="mb-3 sm:mb-4 flex justify-center">
                          <LinkIcon link={link} size={isMobileFolderView ? 52 : 60} />
                        </div>
                        <span className="block text-[13px] sm:text-sm font-medium leading-tight text-white">
                          {link.title}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-700/60 bg-slate-800/45 px-4 py-8 text-center text-sm text-slate-400">
                  Empty folder
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  // ── View mode ─────────────────────────────────────────────────────────────────
  if (!editMode) {
    return (
      <>
        <div className="w-full">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-5">
          {allGridItems.map((item) => {
            if (item.itemType === 'folder') {
              const folder = item.data;
              const contents = linksInFolder(folder.id).sort((a, b) => a.order_index - b.order_index);
              return (
                <div
                  key={`folder-${folder.id}`}
                  className={`${tileBase} p-0 ${
                    expandedFolderId === folder.id
                      ? 'border-indigo-300/45 bg-indigo-950/35 shadow-[0_0_0_1px_rgba(129,140,248,0.2),0_32px_90px_rgba(49,46,129,0.24)]'
                      : ''
                  }`}
                >
                  <button
                    onClick={() => toggleFolderOpen(folder.id)}
                    className="flex h-full min-h-[11.5rem] w-full flex-col items-center justify-center p-5 text-center sm:min-h-[12rem] lg:min-h-[12.5rem]"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_26px_rgba(2,6,23,0.24)]">
                      <FolderIcon icon={folder.icon} size={isMobileFolderView ? 38 : 42} />
                    </div>
                    <span className="mt-4 max-w-full truncate text-base font-medium text-white transition-colors group-hover:text-indigo-100">{folder.name}</span>
                    <span className="mt-1.5 text-xs text-violet-300">{contents.length} link{contents.length !== 1 ? 's' : ''}</span>
                    <span className="mt-4 flex h-9 w-9 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-100 transition-all group-hover:border-violet-300/50 group-hover:bg-violet-400/20 group-hover:shadow-[0_0_20px_rgba(139,92,246,0.25)]">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </button>
                </div>
              );
            }

            // Root link tile
            const link = item.data;
            return (
              <a
                key={`link-${link.id}`}
                href={formatUrl(link.url)}
                className={tileBase}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_26px_rgba(2,6,23,0.24)]">
                  <LinkIcon link={link} size={isMobileFolderView ? 38 : 42} />
                </div>
                <h3 className="mt-4 max-w-full truncate text-base font-medium text-white transition-colors group-hover:text-indigo-100">{link.title}</h3>
                <p className="mt-1.5 text-xs text-violet-300">Quick link</p>
                <span className="mt-4 flex h-9 w-9 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-100 transition-all group-hover:border-violet-300/50 group-hover:bg-violet-400/20 group-hover:shadow-[0_0_20px_rgba(139,92,246,0.25)]">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </a>
            );
          })}

          {allGridItems.length === 0 && (
            <div className="glass-panel col-span-full rounded-[1.8rem] px-6 py-16 text-center text-slate-400">No quick links yet.</div>
          )}
        </div>
        </div>
        {folderOverlay}
      </>
    );
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────────
  const draftLink: Quicklink = {
    id: 'draft',
    title: title || 'Untitled link',
    url: url || 'example.com',
    icon: icon || '🔗',
    order_index: 0,
    scope: collection,
    user_id: user?.id || '',
    folder_id: linkFolderId || null,
  };

  const editorOverlay = (showForm || showFolderForm) && typeof document !== 'undefined'
    ? createPortal(
        <div className="fixed inset-0 z-[180] flex justify-end bg-slate-950/72 backdrop-blur-sm">
          <aside
            aria-modal="true"
            aria-label={showFolderForm ? (editingFolder ? 'Edit folder' : 'Add folder') : (editingLink ? 'Edit link' : 'Add link')}
            role="dialog"
            className="ql-editor-open flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-slate-950/95 shadow-[-32px_0_90px_rgba(2,6,23,0.72)]"
          >
            <div className="flex items-start justify-between gap-5 border-b border-white/10 px-5 py-5 sm:px-7 sm:py-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-300/20 bg-indigo-400/10 text-indigo-200">
                  {showFolderForm ? <Folder className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">
                    {editingFolder || editingLink ? 'Editing existing item' : 'Create new item'}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    {showFolderForm
                      ? (editingFolder ? 'Edit folder' : 'Add a folder')
                      : (editingLink ? 'Edit quick link' : 'Add a quick link')}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={showFolderForm ? resetFolderForm : resetForm}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                aria-label="Close editor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="scrollbar-theme min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
              {showFolderForm ? (
                <form
                  className="space-y-6"
                  onSubmit={(e) => { e.preventDefault(); void (editingFolder ? updateFolder() : addFolder()); }}
                >
                  <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Preview</p>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-amber-300/15 bg-amber-300/[0.07]">
                        <FolderIcon icon={folderIcon} size={38} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-white">{folderName || 'Untitled folder'}</p>
                        <p className="mt-1 text-sm text-slate-400">Folder · 0 links</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="quicklink-folder-name" className="mb-2 block text-sm font-medium text-slate-200">Folder name</label>
                    <input
                      id="quicklink-folder-name"
                      type="text"
                      placeholder="e.g. Design tools"
                      value={folderName}
                      onChange={(e) => setFolderName(e.target.value)}
                      className="h-12 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/70 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label htmlFor="quicklink-folder-icon" className="text-sm font-medium text-slate-200">Folder icon</label>
                      <button
                        type="button"
                        onClick={() => setShowIconPicker((value) => !value)}
                        className="text-xs font-medium text-indigo-300 transition hover:text-indigo-200"
                      >
                        {showIconPicker ? 'Hide icon choices' : 'Choose an icon'}
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-900/80">
                        <FolderIcon icon={folderIcon} size={28} />
                      </span>
                      <input
                        id="quicklink-folder-icon"
                        type="text"
                        placeholder="Emoji or image URL"
                        value={folderIcon}
                        onChange={(e) => setFolderIcon(e.target.value)}
                        className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900/80 px-4 text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/70 focus:ring-4 focus:ring-indigo-500/10"
                      />
                    </div>
                    {showIconPicker && (
                      <div className="ql-folder-open mt-3 rounded-2xl border border-white/10 bg-slate-900/80 p-3">
                        <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
                          {FOLDER_ICONS.map((folderIconOption) => (
                            <button
                              key={folderIconOption}
                              type="button"
                              onClick={() => { setFolderIcon(folderIconOption); setShowIconPicker(false); }}
                              className={`flex aspect-square items-center justify-center rounded-lg text-xl transition hover:bg-white/10 ${folderIcon === folderIconOption ? 'bg-indigo-500/20 ring-1 ring-indigo-400/60' : ''}`}
                              aria-label={`Use ${folderIconOption} icon`}
                            >
                              {folderIconOption}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">Use an emoji or paste a direct image URL.</p>
                  </div>

                  <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-6 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={resetFolderForm}
                      className="h-11 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!folderName.trim()}
                      className="flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(79,70,229,0.3)] transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" />
                      {editingFolder ? 'Save changes' : 'Create folder'}
                    </button>
                  </div>
                </form>
              ) : (
                <form
                  className="space-y-6"
                  onSubmit={(e) => { e.preventDefault(); void (editingLink ? updateLink() : addLink()); }}
                >
                  <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Preview</p>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-indigo-300/15 bg-indigo-300/[0.07]">
                        <LinkIcon link={draftLink} size={38} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-white">{title || 'Untitled link'}</p>
                        <p className="mt-1 truncate text-sm text-slate-400">{hostnameFor(url || 'example.com')}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="quicklink-title" className="mb-2 block text-sm font-medium text-slate-200">Title</label>
                    <input
                      id="quicklink-title"
                      type="text"
                      placeholder="e.g. Team Figma"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="h-12 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/70 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>

                  <div>
                    <label htmlFor="quicklink-url" className="mb-2 block text-sm font-medium text-slate-200">URL</label>
                    <div className="relative">
                      <Globe2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        id="quicklink-url"
                        type="url"
                        placeholder="https://example.com"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="h-12 w-full rounded-xl border border-white/10 bg-slate-900/80 pl-11 pr-4 text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/70 focus:ring-4 focus:ring-indigo-500/10"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="quicklink-icon" className="mb-2 block text-sm font-medium text-slate-200">Icon</label>
                    <input
                      id="quicklink-icon"
                      type="text"
                      placeholder="Emoji or image URL"
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      className="h-12 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/70 focus:ring-4 focus:ring-indigo-500/10"
                    />
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">Keep an emoji here and Olio will try the website favicon first.</p>
                  </div>

                  {collection === 'personal' && collectionFolders.length > 0 && (
                    <div>
                      <label htmlFor="quicklink-folder" className="mb-2 block text-sm font-medium text-slate-200">Folder</label>
                      <select
                        id="quicklink-folder"
                        value={linkFolderId}
                        onChange={(e) => setLinkFolderId(e.target.value)}
                        className="h-12 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 text-white outline-none focus:border-indigo-400/70 focus:ring-4 focus:ring-indigo-500/10"
                      >
                        <option value="">No folder (root)</option>
                        {collectionFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.icon} {folder.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-6 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="h-11 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!title.trim() || !url.trim()}
                      className="flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(79,70,229,0.3)] transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" />
                      {editingLink ? 'Save changes' : 'Create link'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </aside>
        </div>,
        document.body,
      )
    : null;

  const linkDeleteModal = linkToDelete && typeof document !== 'undefined'
    ? createPortal(
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-md">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-link-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-[0_32px_100px_rgba(2,6,23,0.82)] sm:p-7">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10 text-rose-300">
              <Trash2 className="h-5 w-5" />
            </div>
            <h3 id="delete-link-title" className="mt-5 text-xl font-semibold text-white">Delete this quick link?</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">“{linkToDelete.title}” will be permanently removed. This can’t be undone.</p>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button onClick={() => setLinkToDelete(null)} className="h-11 rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white">Keep link</button>
              <button onClick={deleteLink} className="h-11 rounded-xl bg-rose-500 px-5 text-sm font-semibold text-white transition hover:bg-rose-400">Delete link</button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  const folderDeleteModal = folderToDelete && typeof document !== 'undefined'
    ? createPortal(
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-md">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-folder-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-[0_32px_100px_rgba(2,6,23,0.82)] sm:p-7">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/15 bg-amber-300/[0.07]">
              <FolderIcon icon={folderToDelete.icon} size={32} />
            </div>
            <h3 id="delete-folder-title" className="mt-5 text-xl font-semibold text-white">Delete “{folderToDelete.name}”?</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">Choose what should happen to the links currently inside this folder.</p>
            <div className="mt-7 space-y-3">
              <button onClick={() => deleteFolder('root')} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                Move links to root
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </button>
              <button onClick={() => deleteFolder('delete')} className="w-full rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-left text-sm font-semibold text-rose-200 transition hover:bg-rose-400/15">Delete folder and all links</button>
              <button onClick={() => setFolderToDelete(null)} className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-slate-400 transition hover:bg-white/[0.05] hover:text-white">Cancel</button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <section className="mx-auto w-full max-w-[88rem]" aria-labelledby="quicklinks-management-title">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_24px_70px_rgba(2,6,23,0.3)] backdrop-blur-xl">
        <header className="flex flex-col gap-4 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-300/15 bg-indigo-400/10 text-indigo-200">
              {collection === 'shared' ? <Users className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 id="quicklinks-management-title" className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                  {collection === 'shared' ? 'Shared Quick Links' : 'Personal Quick Links'}
                </h2>
                <span className="text-xs text-slate-500">
                  {collectionLinks.length} link{collectionLinks.length !== 1 ? 's' : ''}
                  {collection === 'personal' ? ` · ${collectionFolders.length} folder${collectionFolders.length !== 1 ? 's' : ''}` : ''}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{collection === 'shared' ? 'Organization library' : 'Your bookmark library'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {collection === 'personal' && (
              <button onClick={() => { resetFolderForm(); setShowFolderForm(true); }} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.045] px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08] sm:flex-none" aria-label="New folder">
                <Folder className="h-3.5 w-3.5" /> Folder
              </button>
            )}
            <button onClick={() => setShowForm(true)} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-3.5 text-xs font-semibold text-white transition hover:bg-indigo-400 sm:flex-none" aria-label="New link">
              <Plus className="h-3.5 w-3.5" /> Link
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-1 border-b border-white/[0.07] bg-white/[0.018] px-4 py-2 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          {collection === 'personal' ? (
            <span className="flex items-center gap-1.5"><GripVertical className="h-3.5 w-3.5 text-indigo-300" /> Drag the handle to reorder items. Drop a link onto a folder to organize it.</span>
          ) : (
            <span>Links here are available to everyone in the organization.</span>
          )}
          <span className={savingOrder ? 'font-medium text-indigo-200' : ''}>{savingOrder ? 'Saving order…' : collection === 'personal' ? 'Changes save automatically' : 'Everyone'}</span>
        </div>

        {allGridItems.length > 0 ? (
          <div>
            <div className="hidden grid-cols-[2.5rem_2.75rem_minmax(0,1fr)_7rem_7rem_5.5rem] items-center gap-3 border-b border-white/[0.07] bg-slate-950/35 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 md:grid sm:px-5">
              <span />
              <span />
              <span>Name</span>
              <span>Type</span>
              <span>Location</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-white/[0.065]">
              {allGridItems.map((item) => {
                const isDragging = dragging?.id === item.id;
                const dt = dropTarget?.id === item.id && !isDragging ? dropTarget : null;
                const isIntoTarget = dt?.side === 'into';

                if (item.itemType === 'folder') {
                  const folder = item.data;
                  const folderLinks = collectionLinks.filter((link) => link.folder_id === folder.id).sort((a, b) => a.order_index - b.order_index);
                  const isExpanded = expandedFolderId === folder.id;
                  return (
                    <article key={`folder-${folder.id}`} className={`relative transition ${isDragging ? 'opacity-40' : ''} ${isIntoTarget ? 'bg-emerald-400/[0.08] ring-1 ring-inset ring-emerald-400/35' : ''}`} onDragOver={onDragOver(folder.id, 'folder')} onDrop={onDropOn(folder.id, 'folder')}>
                      {dt && dt.side !== 'into' && <div className={`pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-indigo-400 ${dt.side === 'before' ? 'top-0' : 'bottom-0'}`} />}
                      <div className="grid min-h-[4.5rem] grid-cols-[2.25rem_2.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 transition hover:bg-white/[0.025] sm:px-5 md:grid-cols-[2.5rem_2.75rem_minmax(0,1fr)_7rem_7rem_5.5rem] md:gap-3">
                        <button draggable onDragStart={onDragStart(folder.id, 'folder')} onDragEnd={onDragEnd} className="flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-slate-600 transition hover:bg-white/[0.06] hover:text-slate-300 active:cursor-grabbing" title="Drag to reorder" aria-label={`Reorder ${folder.name}`}>
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <button onClick={() => setExpandedFolderId(isExpanded ? null : folder.id)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-300/10 bg-amber-300/[0.055]" aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${folder.name}`}>
                          <FolderIcon icon={folder.icon} size={24} />
                        </button>
                        <button onClick={() => setExpandedFolderId(isExpanded ? null : folder.id)} className="min-w-0 text-left">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-white">{folder.name}</span>
                            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">{folderLinks.length} link{folderLinks.length !== 1 ? 's' : ''}</span>
                        </button>
                        <span className="hidden text-xs text-amber-200/75 md:block">Folder</span>
                        <span className="hidden text-xs text-slate-500 md:block">Root</span>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEditFolder(folder)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-indigo-400/10 hover:text-indigo-200" aria-label={`Edit ${folder.name}`}><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setFolderToDelete(folder)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-rose-400/10 hover:text-rose-300" aria-label={`Delete ${folder.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      {isIntoTarget && <div className="pointer-events-none absolute right-24 top-1/2 -translate-y-1/2 rounded-md border border-emerald-300/20 bg-emerald-950 px-2 py-1 text-[10px] font-semibold text-emerald-200">Move into folder</div>}
                      {isExpanded && (
                        <div className="ql-folder-open border-t border-white/[0.055] bg-slate-950/38 py-1 pl-5 pr-3 sm:pl-14 sm:pr-5">
                          {folderLinks.length > 0 ? folderLinks.map((link) => {
                            const isItemDragging = draggingFolderItem === link.id;
                            const isItemOver = dragOverFolderItemId === link.id && draggingFolderItem !== link.id;
                            return (
                              <div key={link.id} className={`grid min-h-[3.25rem] grid-cols-[1.75rem_2.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 transition hover:bg-white/[0.035] md:grid-cols-[1.75rem_2.25rem_minmax(0,1fr)_7rem_7rem_5.5rem] ${isItemDragging ? 'opacity-40' : ''} ${isItemOver ? 'bg-indigo-400/[0.08] ring-1 ring-inset ring-indigo-400/30' : ''}`} onDragOver={onFolderItemDragOver(link.id)} onDrop={onFolderItemDrop(folder.id, link.id)}>
                                <button draggable onDragStart={onFolderItemDragStart(link.id)} onDragEnd={onFolderItemDragEnd} className="cursor-grab text-slate-700 hover:text-slate-400 active:cursor-grabbing" aria-label={`Reorder ${link.title}`}><GripVertical className="h-3.5 w-3.5" /></button>
                                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.045]"><LinkIcon link={link} size={18} /></span>
                                <div className="min-w-0"><p className="truncate text-xs font-medium text-slate-200">{link.title}</p><p className="truncate text-[10px] text-slate-600">{hostnameFor(link.url)}</p></div>
                                <span className="hidden text-[11px] text-slate-600 md:block">Link</span>
                                <span className="hidden truncate text-[11px] text-slate-600 md:block">{folder.name}</span>
                                <div className="flex justify-end gap-1">
                                  <button onClick={() => startEditLink(link)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-indigo-400/10 hover:text-indigo-200" aria-label={`Edit ${link.title}`}><Pencil className="h-3 w-3" /></button>
                                  <button onClick={() => setLinkToDelete(link)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-700 hover:bg-rose-400/10 hover:text-rose-300" aria-label={`Delete ${link.title}`}><Trash2 className="h-3 w-3" /></button>
                                </div>
                              </div>
                            );
                          }) : <div className="flex items-center gap-2 px-2 py-3 text-xs text-slate-600"><FolderOpen className="h-3.5 w-3.5" /> Empty folder</div>}
                        </div>
                      )}
                    </article>
                  );
                }

                const link = item.data;
                const canEditLink = collection === 'personal' || link.user_id === user?.id || canManageOrg();
                return (
                  <article key={`link-${link.id}`} className={`relative transition hover:bg-white/[0.025] ${isDragging ? 'opacity-40' : ''}`} onDragOver={collection === 'personal' ? onDragOver(link.id, 'link') : undefined} onDrop={collection === 'personal' ? onDropOn(link.id, 'link') : undefined}>
                    {dt && dt.side !== 'into' && <div className={`pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-indigo-400 ${dt.side === 'before' ? 'top-0' : 'bottom-0'}`} />}
                    <div className="grid min-h-[4.5rem] grid-cols-[2.25rem_2.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 sm:px-5 md:grid-cols-[2.5rem_2.75rem_minmax(0,1fr)_7rem_7rem_5.5rem] md:gap-3">
                      {collection === 'personal' ? (
                        <button draggable onDragStart={onDragStart(link.id, 'link')} onDragEnd={onDragEnd} className="flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-slate-600 transition hover:bg-white/[0.06] hover:text-slate-300 active:cursor-grabbing" title="Drag to reorder" aria-label={`Reorder ${link.title}`}><GripVertical className="h-4 w-4" /></button>
                      ) : <span />}
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-300/10 bg-indigo-300/[0.05]"><LinkIcon link={link} size={24} /></span>
                      <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-white">{link.title}</h3><p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500"><Globe2 className="h-3 w-3 shrink-0" /> {hostnameFor(link.url)}</p></div>
                      <span className="hidden text-xs text-indigo-200/70 md:block">Link</span>
                      <span className="hidden text-xs text-slate-500 md:block">Root</span>
                      <div className="flex items-center justify-end gap-1">
                        {canEditLink ? <>
                          <button onClick={() => startEditLink(link)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-indigo-400/10 hover:text-indigo-200" aria-label={`Edit ${link.title}`}><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setLinkToDelete(link)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-rose-400/10 hover:text-rose-300" aria-label={`Delete ${link.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
                        </> : <span className="text-[10px] text-slate-600">View only</span>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[15rem] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-300/15 bg-indigo-300/[0.07] text-indigo-200"><Layers3 className="h-5 w-5" /></div>
            <h3 className="mt-4 text-base font-semibold text-white">No quick links yet</h3>
            <p className="mt-1 text-sm text-slate-500">Add a link to begin.</p>
            <button onClick={() => setShowForm(true)} className="mt-4 flex h-9 items-center gap-2 rounded-lg bg-indigo-500 px-4 text-xs font-semibold text-white hover:bg-indigo-400"><Plus className="h-3.5 w-3.5" /> New link</button>
          </div>
        )}
      </div>

      {editorOverlay}
      {linkDeleteModal}
      {folderDeleteModal}
    </section>
  );
}
