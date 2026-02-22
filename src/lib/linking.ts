export type InternalLinkType =
  | 'project_file'
  | 'project_resource'
  | 'project_planner'
  | 'project_board';

export type LinkTarget =
  | { type: 'external'; url: string }
  | { type: 'help'; articleId: string }
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
