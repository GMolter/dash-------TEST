export type InternalLinkType =
  | 'project_file'
  | 'project_resource'
  | 'project_planner'
  | 'project_board';

export type LinkTarget =
  | { type: 'external'; url: string }
  | { type: 'help'; articleId: string }
  | { type: 'help_anchor'; anchorId: string }
  | { type: InternalLinkType; projectId: string; targetId: string };

export type ParsedMarkdownLink = {
  raw: string;
  label: string;
  href: string;
  start: number;
  end: number;
  target: LinkTarget | null;
};

export type LinkedSegment =
  | { kind: 'text'; text: string; start: number; end: number }
  | { kind: 'link'; link: ParsedMarkdownLink };

const LINK_REGEX = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

function decodeOlioHref(href: string): LinkTarget | null {
  const helpMatch = href.match(/^olio:\/\/help\/([^/?#]+)$/i);
  if (helpMatch) {
    return { type: 'help', articleId: helpMatch[1] };
  }

  const helpAnchorMatch = href.match(/^olio:\/\/help-anchor\/([^/?#]+)$/i);
  if (helpAnchorMatch) {
    return { type: 'help_anchor', anchorId: helpAnchorMatch[1] };
  }

  const projectMatch = href.match(/^olio:\/\/project\/([^/]+)\/(file|resource|planner|board)\/([^/?#]+)$/i);
  if (!projectMatch) return null;

  const [, projectId, rawType, targetId] = projectMatch;
  if (rawType === 'file') return { type: 'project_file', projectId, targetId };
  if (rawType === 'resource') return { type: 'project_resource', projectId, targetId };
  if (rawType === 'planner') return { type: 'project_planner', projectId, targetId };
  if (rawType === 'board') return { type: 'project_board', projectId, targetId };
  return null;
}

export function normalizeExternalUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) return value;
  return `https://${value}`;
}

export function buildLinkHref(target: LinkTarget): string {
  if (target.type === 'external') return normalizeExternalUrl(target.url);
  if (target.type === 'help') return `olio://help/${target.articleId}`;
  if (target.type === 'help_anchor') return `olio://help-anchor/${target.anchorId}`;
  if (target.type === 'project_file') return `olio://project/${target.projectId}/file/${target.targetId}`;
  if (target.type === 'project_resource') return `olio://project/${target.projectId}/resource/${target.targetId}`;
  if (target.type === 'project_planner') return `olio://project/${target.projectId}/planner/${target.targetId}`;
  return `olio://project/${target.projectId}/board/${target.targetId}`;
}

export function parseLinkTarget(href: string): LinkTarget | null {
  if (/^olio:\/\//i.test(href)) return decodeOlioHref(href);
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(href)) return { type: 'external', url: href };
  return null;
}

export function createMarkdownLink(label: string, target: LinkTarget): string {
  const cleanLabel = label.trim();
  const href = buildLinkHref(target);
  return `[${cleanLabel}](${href})`;
}

export function parseMarkdownLinks(content: string): LinkedSegment[] {
  const segments: LinkedSegment[] = [];
  let match: RegExpExecArray | null;
  let cursor = 0;

  LINK_REGEX.lastIndex = 0;
  while ((match = LINK_REGEX.exec(content)) !== null) {
    const full = match[0];
    const label = match[1];
    const href = match[2];
    const start = match.index;
    const end = start + full.length;

    if (start > cursor) {
      segments.push({
        kind: 'text',
        text: content.slice(cursor, start),
        start: cursor,
        end: start,
      });
    }

    segments.push({
      kind: 'link',
      link: {
        raw: full,
        label,
        href,
        start,
        end,
        target: parseLinkTarget(href),
      },
    });

    cursor = end;
  }

  if (cursor < content.length) {
    segments.push({
      kind: 'text',
      text: content.slice(cursor),
      start: cursor,
      end: content.length,
    });
  }

  if (!segments.length) {
    segments.push({ kind: 'text', text: content, start: 0, end: content.length });
  }

  return segments;
}

export function findLinkAtPosition(content: string, position: number): ParsedMarkdownLink | null {
  const segments = parseMarkdownLinks(content);
  for (const segment of segments) {
    if (segment.kind !== 'link') continue;
    if (position >= segment.link.start && position <= segment.link.end) return segment.link;
  }
  return null;
}

export function replaceContentRange(content: string, start: number, end: number, replacement: string): string {
  return `${content.slice(0, start)}${replacement}${content.slice(end)}`;
}

export function replaceSelectionWithLink(
  content: string,
  selectionStart: number,
  selectionEnd: number,
  label: string,
  target: LinkTarget,
) {
  const hasSelection = selectionStart !== selectionEnd;
  const sourceLabel = hasSelection ? content.slice(selectionStart, selectionEnd) : label;
  const finalLabel = sourceLabel.trim() || label.trim();
  const token = createMarkdownLink(finalLabel, target);
  const nextContent = replaceContentRange(content, selectionStart, selectionEnd, token);
  return {
    nextContent,
    token,
    nextCursor: selectionStart + token.length,
  };
}

export function removeMarkdownLink(content: string, link: ParsedMarkdownLink): string {
  return replaceContentRange(content, link.start, link.end, link.label);
}

function rectContainsPoint(rect: DOMRect, x: number, y: number) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function copyTextareaStyles(textarea: HTMLTextAreaElement, mirror: HTMLDivElement) {
  const cs = window.getComputedStyle(textarea);
  mirror.style.position = 'fixed';
  mirror.style.left = `${textarea.getBoundingClientRect().left}px`;
  mirror.style.top = `${textarea.getBoundingClientRect().top}px`;
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.height = `${textarea.clientHeight}px`;
  mirror.style.boxSizing = 'border-box';
  mirror.style.padding = cs.padding;
  mirror.style.border = cs.border;
  mirror.style.fontFamily = cs.fontFamily;
  mirror.style.fontSize = cs.fontSize;
  mirror.style.fontWeight = cs.fontWeight;
  mirror.style.lineHeight = cs.lineHeight;
  mirror.style.letterSpacing = cs.letterSpacing;
  mirror.style.textTransform = cs.textTransform;
  mirror.style.textIndent = cs.textIndent;
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordBreak = 'break-word';
  mirror.style.overflowWrap = 'anywhere';
  mirror.style.overflow = 'hidden';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.zIndex = '-1';
  mirror.style.background = 'transparent';
  mirror.style.color = 'transparent';
}

export function findMarkdownLinkAtClientPoint(
  textarea: HTMLTextAreaElement,
  content: string,
  clientX: number,
  clientY: number,
): ParsedMarkdownLink | null {
  if (typeof document === 'undefined') return null;
  const segments = parseMarkdownLinks(content);
  const links = segments
    .filter((segment): segment is { kind: 'link'; link: ParsedMarkdownLink } => segment.kind === 'link')
    .map((segment) => segment.link);
  if (!links.length) return null;

  for (const link of links) {
    const mirror = document.createElement('div');
    copyTextareaStyles(textarea, mirror);

    const before = document.createTextNode(content.slice(0, link.start));
    const token = document.createElement('span');
    token.textContent = content.slice(link.start, link.end);
    const after = document.createTextNode(content.slice(link.end));

    mirror.append(before, token, after);
    document.body.appendChild(mirror);

    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;

    const rects = Array.from(token.getClientRects());
    document.body.removeChild(mirror);

    if (rects.some((rect) => rectContainsPoint(rect, clientX, clientY))) {
      return link;
    }
  }

  return null;
}
