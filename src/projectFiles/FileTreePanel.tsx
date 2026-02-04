import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FileText, Paperclip, Image } from 'lucide-react';
import type { FileNode } from './store';
import { getFileTypeInfo, formatFileSize } from './store';

type TreeNode = FileNode & { children: TreeNode[] };

function buildTree(nodes: FileNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });

  const roots: TreeNode[] = [];
  for (const n of byId.values()) {
    if (n.parent_id && byId.has(n.parent_id)) byId.get(n.parent_id)!.children.push(n);
    else roots.push(n);
  }

  const sortRec = (arr: TreeNode[]) => {
    arr.sort((a, b) => {
      if (a.type !== b.type) {
        const rank = (t: string) => (t === 'folder' ? 0 : t === 'doc' ? 1 : 2);
        return rank(a.type) - rank(b.type);
      }
      return a.sort_index - b.sort_index;
    });
    for (const c of arr) sortRec(c.children);
  };
  sortRec(roots);

  return roots;
}

export function FileTreePanel({
  nodes,
  selectedId,
  onSelect,
  onRequestNewDoc,
  onRequestNewFolder,
  onMove,
  onContextMenu,
}: {
  nodes: FileNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRequestNewDoc: (parentId: string | null) => void;
  onRequestNewFolder: (parentId: string | null) => void;
  onMove: (dragId: string, targetFolderId: string | null) => void;
  onContextMenu: (nodeId: string, x: number, y: number) => void;
}) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({}));

  const toggle = (id: string) => setOpen((m) => ({ ...m, [id]: !m[id] }));
  const isOpen = (id: string) => open[id] ?? true;

  return (
    <div className="select-none">
      <TreeList
        level={0}
        items={tree}
        isOpen={isOpen}
        onToggle={toggle}
        selectedId={selectedId}
        onSelect={onSelect}
        onRequestNewDoc={onRequestNewDoc}
        onRequestNewFolder={onRequestNewFolder}
        onMove={onMove}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}

function TreeList({
  items,
  level,
  isOpen,
  onToggle,
  selectedId,
  onSelect,
  onRequestNewDoc,
  onRequestNewFolder,
  onMove,
  onContextMenu,
}: {
  items: TreeNode[];
  level: number;
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRequestNewDoc: (parentId: string | null) => void;
  onRequestNewFolder: (parentId: string | null) => void;
  onMove: (dragId: string, targetFolderId: string | null) => void;
  onContextMenu: (nodeId: string, x: number, y: number) => void;
}) {
  return (
    <div className="space-y-1">
      {items.map((n) => {
        const selected = n.id === selectedId;
        const open = n.type === 'folder' ? isOpen(n.id) : false;
        const padding = 10 + level * 14;

        const fileInfo = getFileTypeInfo(n);
        const icon =
          n.type === 'folder' ? (
            <Folder className="w-4 h-4 text-slate-200" />
          ) : n.type === 'doc' ? (
            <FileText className="w-4 h-4 text-slate-200" />
          ) : fileInfo.category === 'image' ? (
            <Image className={`w-4 h-4 ${fileInfo.color}`} />
          ) : (
            <Paperclip className={`w-4 h-4 ${fileInfo.color}`} />
          );

        return (
          <div key={n.id}>
            <div
              className={`group flex items-center gap-2 rounded-2xl border transition-colors ${
                selected
                  ? 'bg-blue-500/18 border-blue-500/30'
                  : 'bg-slate-950/10 border-slate-800/50 hover:bg-slate-900/35'
              }`}
              style={{ paddingLeft: padding }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', n.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (n.type === 'folder') e.preventDefault();
              }}
              onDrop={(e) => {
                if (n.type !== 'folder') return;
                const dragId = e.dataTransfer.getData('text/plain');
                if (!dragId || dragId === n.id) return;
                onMove(dragId, n.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu(n.id, e.clientX, e.clientY);
              }}
            >
              {n.type === 'folder' ? (
                <button
                  className="p-1 rounded-lg hover:bg-slate-900/40"
                  onClick={() => onToggle(n.id)}
                  aria-label="Toggle"
                >
                  {open ? (
                    <ChevronDown className="w-4 h-4 text-slate-300" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  )}
                </button>
              ) : (
                <div className="w-7" />
              )}

              <div
                className="flex-1 min-w-0 py-2.5 pr-3"
                onClick={() => {
                  if (n.type === 'doc') onSelect(n.id);
                  if (n.type === 'upload' && n.meta?.url) window.open(String(n.meta.url), '_blank');
                  if (n.type === 'folder') onToggle(n.id);
                }}
              >
                <div className="flex items-center gap-2">
                  {icon}
                  <span className="text-sm text-slate-100 truncate">{n.name}</span>
                  {n.type === 'upload' && n.meta?.size && (
                    <span className="text-xs text-slate-400">
                      {formatFileSize(n.meta.size)}
                    </span>
                  )}
                </div>
              </div>

              {n.type === 'folder' && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity pr-2 flex items-center gap-1">
                  <button
                    className="px-2 py-1.5 rounded-xl border border-slate-800/60 bg-slate-950/30 hover:bg-slate-900/45 text-xs text-slate-200"
                    onClick={() => onRequestNewDoc(n.id)}
                    title="New doc"
                  >
                    Doc
                  </button>
                  <button
                    className="px-2 py-1.5 rounded-xl border border-slate-800/60 bg-slate-950/30 hover:bg-slate-900/45 text-xs text-slate-200"
                    onClick={() => onRequestNewFolder(n.id)}
                    title="New folder"
                  >
                    Folder
                  </button>
                </div>
              )}
            </div>

            {n.type === 'folder' && open && n.children.length > 0 && (
              <div className="mt-1">
                <TreeList
                  items={n.children}
                  level={level + 1}
                  isOpen={isOpen}
                  onToggle={onToggle}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onRequestNewDoc={onRequestNewDoc}
                  onRequestNewFolder={onRequestNewFolder}
                  onMove={onMove}
                  onContextMenu={onContextMenu}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
