import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, CheckCircle2, Link2 } from 'lucide-react';
import type { FileNode } from './store';
import { updateNode } from './store';
import { supabase } from '../lib/supabase';
import type { LinkTarget, ParsedMarkdownLink } from '../lib/linking';
import {
  findLinkAtPosition,
  removeMarkdownLink,
  replaceSelectionWithLink,
} from '../lib/linking';
import { LinkPickerModal } from '../components/linking/LinkPickerModal';
import { EditorContextMenu } from '../components/linking/EditorContextMenu';
import { LinkedContent } from '../components/linking/renderLinkedContent';
import type { LinkPickerOption, LinkResolvedMeta } from '../components/linking/types';

type LinkDraftRange = {
  start: number;
  end: number;
  initialTarget: LinkTarget | null;
};

type ContextMenuState = {
  x: number;
  y: number;
  token: ParsedMarkdownLink | null;
  start: number;
  end: number;
};

type FileOption = {
  id: string;
  name: string;
  type: 'doc' | 'upload';
};

type ResourceOption = {
  id: string;
  title: string;
  url: string;
  category: string;
};

type PlannerOption = {
  id: string;
  title: string;
  completed: boolean;
  archived: boolean;
};

type BoardOption = {
  id: string;
  title: string;
  completed: boolean;
  archived: boolean;
};

export function DocEditor({
  projectId,
  doc,
  onTitleChange,
  onContentChange,
  onSaved,
  onActivateInternalLink,
}: {
  projectId: string;
  doc: FileNode;
  onTitleChange: (name: string) => void;
  onContentChange: (content: string) => void;
  onSaved?: () => void;
  onActivateInternalLink?: (link: ParsedMarkdownLink) => void;
}) {
  const [title, setTitle] = useState(doc.name);
  const [content, setContent] = useState(doc.content || '');
  const [saved, setSaved] = useState(true);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkPickerInitialLabel, setLinkPickerInitialLabel] = useState('');
  const [pendingRange, setPendingRange] = useState<LinkDraftRange | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [fileTargets, setFileTargets] = useState<FileOption[]>([]);
  const [resourceTargets, setResourceTargets] = useState<ResourceOption[]>([]);
  const [plannerTargets, setPlannerTargets] = useState<PlannerOption[]>([]);
  const [boardTargets, setBoardTargets] = useState<BoardOption[]>([]);

  const saveTimer = useRef<number | null>(null);
  const lastSavedRef = useRef<string>(content);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setTitle(doc.name);
    setContent(doc.content || '');
    lastSavedRef.current = doc.content || '';
    setSaved(true);
  }, [doc.id, doc.name, doc.content]);

  useEffect(() => {
    let cancelled = false;

    async function loadTargets() {
      if (!projectId) {
        setFileTargets([]);
        setResourceTargets([]);
        setPlannerTargets([]);
        setBoardTargets([]);
        return;
      }

      const [fileRes, resourceRes, plannerRes, boardRes] = await Promise.all([
        supabase
          .from('project_files')
          .select('id,name,type')
          .eq('project_id', projectId)
          .in('type', ['doc', 'upload'])
          .order('updated_at', { ascending: false }),
        supabase
          .from('project_resources')
          .select('id,title,url,category')
          .eq('project_id', projectId)
          .order('position', { ascending: true }),
        supabase
          .from('project_planner_steps')
          .select('id,title,completed,archived')
          .eq('project_id', projectId)
          .order('position', { ascending: true }),
        supabase
          .from('project_board_cards')
          .select('id,title,completed,archived')
          .eq('project_id', projectId)
          .order('position', { ascending: true }),
      ]);

      if (cancelled) return;

      if (fileRes.error) console.error('Failed loading file targets:', fileRes.error);
      if (resourceRes.error) console.error('Failed loading resource targets:', resourceRes.error);
      if (plannerRes.error) console.error('Failed loading planner targets:', plannerRes.error);
      if (boardRes.error) console.error('Failed loading board targets:', boardRes.error);

      setFileTargets((fileRes.data as FileOption[]) || []);
      setResourceTargets((resourceRes.data as ResourceOption[]) || []);
      setPlannerTargets((plannerRes.data as PlannerOption[]) || []);
      setBoardTargets((boardRes.data as BoardOption[]) || []);
    }

    void loadTargets();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);

    if (content === lastSavedRef.current) {
      setSaved(true);
      return;
    }

    setSaved(false);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await updateNode(doc.id, { content });
        lastSavedRef.current = content;
        setSaved(true);
        onSaved?.();
      } catch {
        setSaved(false);
      }
    }, 450);

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [content, doc.id, onSaved]);

  const linkOptions = useMemo<LinkPickerOption[]>(() => {
    const fileItems: LinkPickerOption[] = fileTargets.map((file) => ({
      id: `file-${file.id}`,
      tab: 'file',
      title: file.name,
      subtitle: file.type === 'upload' ? 'Uploaded file' : 'Document',
      badge: file.type === 'upload' ? 'File' : 'Doc',
      target: {
        type: 'project_file',
        projectId,
        targetId: file.id,
      },
    }));

    const resourceItems: LinkPickerOption[] = resourceTargets.map((resource) => ({
      id: `resource-${resource.id}`,
      tab: 'resource',
      title: resource.title?.trim() || resource.url,
      subtitle: resource.url,
      badge: resource.category,
      target: {
        type: 'project_resource',
        projectId,
        targetId: resource.id,
      },
    }));

    const plannerItems: LinkPickerOption[] = plannerTargets.map((task) => ({
      id: `planner-${task.id}`,
      tab: 'planner',
      title: task.title || '(Untitled task)',
      subtitle: task.archived ? 'Archived planner task' : 'Planner task',
      badge: task.completed ? 'Done' : 'Open',
      target: {
        type: 'project_planner',
        projectId,
        targetId: task.id,
      },
    }));

    const boardItems: LinkPickerOption[] = boardTargets.map((card) => ({
      id: `board-${card.id}`,
      tab: 'board',
      title: card.title || '(Untitled card)',
      subtitle: card.archived ? 'Archived board card' : 'Board card',
      badge: card.completed ? 'Done' : 'Open',
      target: {
        type: 'project_board',
        projectId,
        targetId: card.id,
      },
    }));

    return [...fileItems, ...resourceItems, ...plannerItems, ...boardItems];
  }, [fileTargets, resourceTargets, plannerTargets, boardTargets, projectId]);

  const status = useMemo(() => (saved ? 'Saved' : 'Saving...'), [saved]);

  const resolveMeta = useMemo(() => {
    const fileMap = new Map(fileTargets.map((item) => [item.id, item]));
    const resourceMap = new Map(resourceTargets.map((item) => [item.id, item]));
    const plannerMap = new Map(plannerTargets.map((item) => [item.id, item]));
    const boardMap = new Map(boardTargets.map((item) => [item.id, item]));

    return (link: ParsedMarkdownLink): LinkResolvedMeta => {
      if (!link.target) {
        return { exists: false, title: link.label, subtitle: 'Invalid link target' };
      }

      if (link.target.type === 'external') {
        return {
          exists: true,
          title: link.label,
          subtitle: link.target.url,
        };
      }

      if (link.target.type === 'help') {
        return {
          exists: true,
          title: link.label,
          subtitle: `Help reference ${link.target.articleId}`,
        };
      }

      if (link.target.type === 'project_file') {
        const item = fileMap.get(link.target.targetId);
        if (!item) {
          return {
            exists: false,
            title: link.label,
            subtitle: 'File reference unavailable',
            warning: 'This target may have been deleted or you no longer have access.',
          };
        }
        return {
          exists: true,
          title: item.name,
          subtitle: item.type === 'upload' ? 'Uploaded file' : 'Document',
        };
      }

      if (link.target.type === 'project_resource') {
        const item = resourceMap.get(link.target.targetId);
        if (!item) {
          return {
            exists: false,
            title: link.label,
            subtitle: 'Resource reference unavailable',
            warning: 'This target may have been deleted or you no longer have access.',
          };
        }
        return {
          exists: true,
          title: item.title?.trim() || item.url,
          subtitle: item.url,
        };
      }

      if (link.target.type === 'project_planner') {
        const item = plannerMap.get(link.target.targetId);
        if (!item) {
          return {
            exists: false,
            title: link.label,
            subtitle: 'Planner reference unavailable',
            warning: 'This target may have been deleted or you no longer have access.',
          };
        }
        return {
          exists: true,
          title: item.title || '(Untitled task)',
          subtitle: item.completed ? 'Planner task (completed)' : 'Planner task',
        };
      }

      const board = boardMap.get(link.target.targetId);
      if (!board) {
        return {
          exists: false,
          title: link.label,
          subtitle: 'Board reference unavailable',
          warning: 'This target may have been deleted or you no longer have access.',
        };
      }
      return {
        exists: true,
        title: board.title || '(Untitled card)',
        subtitle: board.completed ? 'Board card (completed)' : 'Board card',
      };
    };
  }, [fileTargets, resourceTargets, plannerTargets, boardTargets]);

  function applyEditorContent(next: string, nextCursor?: number) {
    setContent(next);
    onContentChange(next);
    if (typeof nextCursor === 'number' && textareaRef.current) {
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
    }
  }

  function openLinkPicker(start: number, end: number, initialTarget: LinkTarget | null) {
    const selectionLabel = start !== end ? content.slice(start, end) : '';
    setPendingRange({ start, end, initialTarget });
    setLinkPickerInitialLabel(selectionLabel);
    setLinkPickerOpen(true);
  }

  return (
    <div className="rounded-3xl border border-slate-800/60 bg-slate-950/80 p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-slate-200">
            <FileText className="h-4 w-4" />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const t = title.trim();
                if (t && t !== doc.name) onTitleChange(t);
              }}
              className="w-full bg-transparent text-lg font-semibold focus:outline-none"
            />
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              {status}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            const el = textareaRef.current;
            if (!el) return;
            openLinkPicker(el.selectionStart, el.selectionEnd, null);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/35 bg-blue-500/12 px-3 py-1.5 text-xs text-blue-100 hover:bg-blue-500/20"
        >
          <Link2 className="h-3.5 w-3.5" />
          Insert Link
        </button>
        <div className="text-xs text-slate-400">Ctrl/Cmd+K inserts link when text is selected.</div>
      </div>

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => {
          const next = e.target.value;
          setContent(next);
          onContentChange(next);
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            const el = e.currentTarget;
            if (el.selectionStart !== el.selectionEnd) {
              e.preventDefault();
              openLinkPicker(el.selectionStart, el.selectionEnd, null);
            }
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const el = e.currentTarget;
          const base = el.selectionStart === el.selectionEnd ? Math.max(0, el.selectionStart - 1) : el.selectionStart;
          const token = findLinkAtPosition(content, base);
          setCtxMenu({
            x: e.clientX,
            y: e.clientY,
            token,
            start: el.selectionStart,
            end: el.selectionEnd,
          });
        }}
        data-link-editor="true"
        placeholder="Write here..."
        className="mt-3 min-h-[420px] w-full resize-none rounded-3xl border border-slate-800/60 bg-slate-950/60 px-5 py-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
      />

      <div className="mt-5 rounded-2xl border border-slate-800/70 bg-slate-950/45 p-4">
        <div className="mb-3 text-xs uppercase tracking-wide text-slate-400">Live Preview</div>
        <LinkedContent
          content={content}
          resolveMeta={resolveMeta}
          onActivateInternalLink={(link) => onActivateInternalLink?.(link)}
        />
      </div>

      <EditorContextMenu
        open={!!ctxMenu}
        x={ctxMenu?.x || 0}
        y={ctxMenu?.y || 0}
        canEdit={!!ctxMenu?.token?.target}
        canRemove={!!ctxMenu?.token}
        onClose={() => setCtxMenu(null)}
        onInsert={() => {
          if (!ctxMenu) return;
          openLinkPicker(ctxMenu.start, ctxMenu.end, null);
        }}
        onEdit={() => {
          if (!ctxMenu?.token?.target) return;
          setPendingRange({
            start: ctxMenu.token.start,
            end: ctxMenu.token.end,
            initialTarget: ctxMenu.token.target,
          });
          setLinkPickerInitialLabel(ctxMenu.token.label);
          setLinkPickerOpen(true);
        }}
        onRemove={() => {
          if (!ctxMenu?.token) return;
          const next = removeMarkdownLink(content, ctxMenu.token);
          applyEditorContent(next, ctxMenu.token.start + ctxMenu.token.label.length);
        }}
      />

      <LinkPickerModal
        open={linkPickerOpen}
        allowedTabs={['external', 'file', 'resource', 'planner', 'board']}
        options={linkOptions}
        initialLabel={linkPickerInitialLabel}
        initialTarget={pendingRange?.initialTarget || null}
        onClose={() => {
          setLinkPickerOpen(false);
          setPendingRange(null);
        }}
        onSubmit={({ label, target }) => {
          if (!pendingRange) return;
          const result = replaceSelectionWithLink(content, pendingRange.start, pendingRange.end, label, target);
          applyEditorContent(result.nextContent, result.nextCursor);
          setLinkPickerOpen(false);
          setPendingRange(null);
        }}
      />
    </div>
  );
}
