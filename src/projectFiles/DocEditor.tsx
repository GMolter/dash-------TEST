import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, CheckCircle2, Link2 } from 'lucide-react';
import type { FileNode } from './store';
import { updateNode } from './store';
import { supabase } from '../lib/supabase';
import type { LinkTarget, ParsedMarkdownLink } from '../lib/linking';
import {
  parseMarkdownLinks,
  buildLinkHref,
  createMarkdownLink,
  parseLinkTarget,
} from '../lib/linking';
import { LinkPickerModal } from '../components/linking/LinkPickerModal';
import { EditorContextMenu } from '../components/linking/EditorContextMenu';
import { LinkHoverPreview } from '../components/linking/LinkHoverPreview';
import type { LinkPickerOption } from '../components/linking/types';

type LinkDraftRange = {
  mode: 'insert' | 'edit';
  selectionRange: Range | null;
  linkElement: HTMLElement | null;
  initialTarget: LinkTarget | null;
};

type ContextMenuState = {
  x: number;
  y: number;
  linkElement: HTMLElement | null;
};

type HoverPreviewState = {
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  warning?: string;
  actionHint?: string;
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
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const [fileTargets, setFileTargets] = useState<FileOption[]>([]);
  const [resourceTargets, setResourceTargets] = useState<ResourceOption[]>([]);
  const [plannerTargets, setPlannerTargets] = useState<PlannerOption[]>([]);
  const [boardTargets, setBoardTargets] = useState<BoardOption[]>([]);

  const saveTimer = useRef<number | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const hoverTokenKeyRef = useRef<string | null>(null);
  const hoverPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastSavedRef = useRef<string>(content);
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTitle(doc.name);
    setContent(doc.content || '');
    lastSavedRef.current = doc.content || '';
    setSaved(true);
  }, [doc.id, doc.name]);

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

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    renderEditorFromMarkdown(doc.content || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

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

  function applyEditorContent(next: string) {
    setContent(next);
    onContentChange(next);
  }

  function setCaretAfterNode(node: Node) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function getSelectionRangeWithinEditor(): Range | null {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
    return range;
  }

  function buildParsedLinkFromElement(el: HTMLElement): ParsedMarkdownLink | null {
    const href = el.dataset.linkHref || '';
    const label = (el.textContent || '').trim();
    if (!href || !label) return null;
    return {
      raw: `[${label}](${href})`,
      label,
      href,
      start: 0,
      end: 0,
      target: parseLinkTarget(href),
    };
  }

  function decorateLinkElement(el: HTMLElement, target: LinkTarget) {
    el.dataset.linkNode = 'true';
    el.contentEditable = 'false';
    el.className = '';
    if (target.type === 'external' || target.type === 'help' || target.type === 'help_anchor') {
      el.className =
        'inline cursor-pointer text-sky-300 underline decoration-sky-300/70 underline-offset-4 hover:text-cyan-200';
      return;
    }
    el.className =
      'mx-0.5 inline-flex cursor-pointer items-center rounded-full border border-cyan-400/40 bg-cyan-500/14 px-2 py-0.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/24';
  }

  function createLinkNode(label: string, target: LinkTarget) {
    const node = document.createElement('span');
    node.dataset.linkHref = buildLinkHref(target);
    node.dataset.linkTarget = target.type;
    node.textContent = label;
    decorateLinkElement(node, target);
    return node;
  }

  function serializeEditorContent() {
    const editor = editorRef.current;
    if (!editor) return '';
    let out = '';

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent?.replace(/\u00a0/g, ' ') || '';
        return;
      }
      if (!(node instanceof HTMLElement)) return;

      if (node.dataset.linkNode === 'true') {
        const href = node.dataset.linkHref || '';
        const label = node.textContent || '';
        const target = parseLinkTarget(href);
        out += target ? createMarkdownLink(label, target) : label;
        return;
      }

      if (node.tagName === 'BR') {
        out += '\n';
        return;
      }

      const isBlock = node.tagName === 'DIV' || node.tagName === 'P';
      const children = Array.from(node.childNodes);
      children.forEach((child) => walk(child));
      if (isBlock && node !== editor && out.length > 0 && !out.endsWith('\n')) out += '\n';
    };

    Array.from(editor.childNodes).forEach((child) => walk(child));
    return out.replace(/\n{3,}/g, '\n\n');
  }

  function renderEditorFromMarkdown(markdown: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const fragment = document.createDocumentFragment();
    const segments = parseMarkdownLinks(markdown || '');
    for (const segment of segments) {
      if (segment.kind === 'text') {
        fragment.appendChild(document.createTextNode(segment.text));
        continue;
      }
      if (!segment.link.target) {
        fragment.appendChild(document.createTextNode(segment.link.raw));
        continue;
      }
      const linkNode = createLinkNode(segment.link.label, segment.link.target);
      fragment.appendChild(linkNode);
    }
    editor.innerHTML = '';
    editor.appendChild(fragment);
  }

  function syncEditorToState() {
    const next = serializeEditorContent();
    applyEditorContent(next);
  }

  function openLinkPickerForInsert(range: Range | null) {
    setPendingRange({
      mode: 'insert',
      selectionRange: range ? range.cloneRange() : null,
      linkElement: null,
      initialTarget: null,
    });
    const selectionLabel = range && !range.collapsed ? range.toString() : '';
    setLinkPickerInitialLabel(selectionLabel);
    setLinkPickerOpen(true);
  }

  function clearHoverPreview() {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    hoverTokenKeyRef.current = null;
    setHoverPreview(null);
  }

  function buildHoverPreview(link: ParsedMarkdownLink): Omit<HoverPreviewState, 'x' | 'y'> {
    if (!link.target) {
      return {
        title: link.label,
        subtitle: link.href,
        warning: 'Malformed link token.',
        actionHint: 'Reference unavailable',
      };
    }

    if (link.target.type === 'external') {
      return {
        title: link.label,
        subtitle: link.target.url,
        actionHint: 'Opens in new tab',
      };
    }

    if (link.target.type === 'help') {
      return {
        title: link.label,
        subtitle: `Help article (${link.target.articleId})`,
        actionHint: 'Opens in new tab',
      };
    }

    if (link.target.type === 'help_anchor') {
      return {
        title: link.label,
        subtitle: `In-article teleport (#${link.target.anchorId})`,
        warning: 'Teleport links are only available inside help articles.',
        actionHint: 'Reference unavailable',
      };
    }

    if (link.target.type === 'project_file') {
      const target = fileTargets.find((file) => file.id === link.target?.targetId);
      const isMissing = !target;
      return {
        title: target?.name || link.label,
        subtitle: target ? (target.type === 'upload' ? 'Project file' : 'Project document') : 'Project file reference',
        warning: isMissing ? 'Reference unavailable.' : undefined,
        actionHint: isMissing ? 'Reference unavailable' : 'In-app reference (Files tab)',
      };
    }

    if (link.target.type === 'project_resource') {
      const target = resourceTargets.find((resource) => resource.id === link.target?.targetId);
      const isMissing = !target;
      return {
        title: target?.title || link.label,
        subtitle: target?.url || 'Project resource reference',
        warning: isMissing ? 'Reference unavailable.' : undefined,
        actionHint: isMissing ? 'Reference unavailable' : 'In-app reference (Resources tab)',
      };
    }

    if (link.target.type === 'project_planner') {
      const target = plannerTargets.find((task) => task.id === link.target?.targetId);
      const isMissing = !target;
      return {
        title: target?.title || link.label,
        subtitle: target ? (target.archived ? 'Archived planner task' : 'Planner task') : 'Planner task reference',
        warning: isMissing ? 'Reference unavailable.' : undefined,
        actionHint: isMissing ? 'Reference unavailable' : 'In-app reference (Planner tab)',
      };
    }

    if (link.target.type !== 'project_board') {
      return {
        title: link.label,
        subtitle: 'Unsupported reference',
        warning: 'Reference unavailable.',
        actionHint: 'Reference unavailable',
      };
    }

    const target = boardTargets.find((card) => card.id === link.target.targetId);
    const isMissing = !target;
    return {
      title: target?.title || link.label,
      subtitle: target ? (target.archived ? 'Archived board task' : 'Board task') : 'Board task reference',
      warning: isMissing ? 'Reference unavailable.' : undefined,
      actionHint: isMissing ? 'Reference unavailable' : 'In-app reference (Board tab)',
    };
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
            openLinkPickerForInsert(getSelectionRangeWithinEditor());
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/35 bg-blue-500/12 px-3 py-1.5 text-xs text-blue-100 hover:bg-blue-500/20"
        >
          <Link2 className="h-3.5 w-3.5" />
          Insert Link
        </button>
        <div className="text-xs text-slate-400">Ctrl/Cmd+K inserts link when text is selected.</div>
      </div>

      <div className="relative mt-3 rounded-3xl border border-slate-800/60 bg-slate-950/60 px-5 py-4 focus-within:ring-2 focus-within:ring-blue-500/35">
        {!content ? <div className="pointer-events-none text-slate-500">Write here...</div> : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          data-link-editor="true"
          aria-label="Document editor"
          className="relative h-[420px] overflow-auto whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-100 outline-none"
          onInput={() => {
            syncEditorToState();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
            window.requestAnimationFrame(() => syncEditorToState());
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
              const range = getSelectionRangeWithinEditor();
              if (range && !range.collapsed) {
                e.preventDefault();
                openLinkPickerForInsert(range);
              }
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              document.execCommand('insertLineBreak');
              window.requestAnimationFrame(() => syncEditorToState());
            }
          }}
          onClick={(e) => {
            const linkEl = (e.target as HTMLElement).closest('[data-link-node="true"]') as HTMLElement | null;
            if (!linkEl) return;
            const token = buildParsedLinkFromElement(linkEl);
            if (!token?.target) return;
            e.preventDefault();
            if (token.target.type === 'external') {
              window.open(token.target.url, '_blank', 'noopener,noreferrer');
              return;
            }
            if (token.target.type === 'help') {
              window.open('/help', '_blank', 'noopener,noreferrer');
              return;
            }
            if (token.target.type === 'help_anchor') {
              return;
            }
            onActivateInternalLink?.(token);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const linkEl = (e.target as HTMLElement).closest('[data-link-node="true"]') as HTMLElement | null;
            setCtxMenu({
              x: e.clientX,
              y: e.clientY,
              linkElement: linkEl,
            });
            clearHoverPreview();
          }}
          onMouseMove={(e) => {
            const linkEl = (e.target as HTMLElement).closest('[data-link-node="true"]') as HTMLElement | null;
            if (!linkEl) {
              clearHoverPreview();
              return;
            }
            const token = buildParsedLinkFromElement(linkEl);
            if (!token) {
              clearHoverPreview();
              return;
            }

            const tokenKey = `${token.href}:${token.label}`;
            hoverPointRef.current = { x: e.clientX, y: e.clientY };
            if (tokenKey === hoverTokenKeyRef.current) {
              if (hoverPreview) {
                setHoverPreview((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
              }
              return;
            }

            if (hoverTimerRef.current) {
              window.clearTimeout(hoverTimerRef.current);
              hoverTimerRef.current = null;
            }

            hoverTokenKeyRef.current = tokenKey;
            setHoverPreview(null);
            const nextPreview = buildHoverPreview(token);
            hoverTimerRef.current = window.setTimeout(() => {
              setHoverPreview({
                ...nextPreview,
                x: hoverPointRef.current.x,
                y: hoverPointRef.current.y,
              });
              hoverTimerRef.current = null;
            }, 1000);
          }}
          onMouseLeave={clearHoverPreview}
          onScroll={clearHoverPreview}
        />
      </div>

      <LinkHoverPreview
        visible={!!hoverPreview}
        x={hoverPreview?.x || 0}
        y={hoverPreview?.y || 0}
        title={hoverPreview?.title || ''}
        subtitle={hoverPreview?.subtitle}
        warning={hoverPreview?.warning}
        actionHint={hoverPreview?.actionHint}
      />

      <EditorContextMenu
        open={!!ctxMenu}
        x={ctxMenu?.x || 0}
        y={ctxMenu?.y || 0}
        canEdit={!!ctxMenu?.linkElement && !!buildParsedLinkFromElement(ctxMenu.linkElement)?.target}
        canRemove={!!ctxMenu?.linkElement}
        onClose={() => setCtxMenu(null)}
        onInsert={() => {
          openLinkPickerForInsert(getSelectionRangeWithinEditor());
        }}
        onEdit={() => {
          if (!ctxMenu?.linkElement) return;
          const token = buildParsedLinkFromElement(ctxMenu.linkElement);
          if (!token?.target) return;
          setPendingRange({
            mode: 'edit',
            selectionRange: null,
            linkElement: ctxMenu.linkElement,
            initialTarget: token.target,
          });
          setLinkPickerInitialLabel(token.label);
          setLinkPickerOpen(true);
        }}
        onRemove={() => {
          if (!ctxMenu?.linkElement) return;
          const label = ctxMenu.linkElement.textContent || '';
          const replacement = document.createTextNode(label);
          ctxMenu.linkElement.replaceWith(replacement);
          setCaretAfterNode(replacement);
          syncEditorToState();
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
          if (pendingRange.mode === 'edit' && pendingRange.linkElement) {
            pendingRange.linkElement.textContent = label;
            pendingRange.linkElement.dataset.linkHref = buildLinkHref(target);
            decorateLinkElement(pendingRange.linkElement, target);
            setCaretAfterNode(pendingRange.linkElement);
            syncEditorToState();
          } else {
            const editor = editorRef.current;
            if (!editor) return;
            const selection = window.getSelection();
            const range = pendingRange.selectionRange && editor.contains(pendingRange.selectionRange.startContainer)
              ? pendingRange.selectionRange
              : (() => {
                  const r = document.createRange();
                  r.selectNodeContents(editor);
                  r.collapse(false);
                  return r;
                })();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
            const node = createLinkNode(label, target);
            range.deleteContents();
            range.insertNode(node);
            setCaretAfterNode(node);
            syncEditorToState();
          }
          setLinkPickerOpen(false);
          setPendingRange(null);
          window.requestAnimationFrame(() => editorRef.current?.focus());
        }}
      />
    </div>
  );
}
