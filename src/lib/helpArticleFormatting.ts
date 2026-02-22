export type ArticleAnchor = {
  id: string;
  title: string;
  level: number;
};

export type ArticleBlock =
  | { kind: 'heading'; level: number; text: string; anchorId: string }
  | { kind: 'unordered_list'; items: string[] }
  | { kind: 'ordered_list'; items: string[] }
  | { kind: 'horizontal_rule' }
  | { kind: 'paragraph'; lines: string[] };

function normalizeContent(content: string): string {
  return (content || '').replace(/\r\n?/g, '\n');
}

function toAnchorSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueAnchorId(raw: string, seen: Map<string, number>): string {
  const base = toAnchorSlug(raw) || 'section';
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  if (count === 0) return base;
  return `${base}-${count + 1}`;
}

function parseHeadingLine(line: string): { level: number; text: string } | null {
  const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
  if (!match) return null;
  const level = Math.min(match[1].length, 6);
  const text = match[2].replace(/\s+#+\s*$/, '').trim();
  if (!text) return null;
  return { level, text };
}

function parseUnorderedListLine(line: string): string | null {
  const match = line.match(/^\s{0,3}(?:[-*+]|•)\s*(.*)\s*$/);
  return match ? match[1].trim() : null;
}

function parseOrderedListLine(line: string): string | null {
  const match = line.match(/^\s{0,3}\d+\.\s*(.*)\s*$/);
  return match ? match[1].trim() : null;
}

function isHorizontalRuleLine(line: string): boolean {
  return /^\s{0,3}(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line);
}

export function extractArticleAnchors(content: string): ArticleAnchor[] {
  const lines = normalizeContent(content).split('\n');
  const seen = new Map<string, number>();
  const anchors: ArticleAnchor[] = [];

  for (const line of lines) {
    const heading = parseHeadingLine(line);
    if (!heading) continue;
    anchors.push({
      id: uniqueAnchorId(heading.text, seen),
      title: heading.text,
      level: heading.level,
    });
  }

  return anchors;
}

export function parseArticleBlocks(content: string): ArticleBlock[] {
  const lines = normalizeContent(content).split('\n');
  const blocks: ArticleBlock[] = [];
  const seenAnchors = new Map<string, number>();
  let i = 0;

  while (i < lines.length) {
    const current = lines[i];

    if (!current.trim()) {
      i += 1;
      continue;
    }

    if (isHorizontalRuleLine(current)) {
      blocks.push({ kind: 'horizontal_rule' });
      i += 1;
      continue;
    }

    const heading = parseHeadingLine(current);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading.level,
        text: heading.text,
        anchorId: uniqueAnchorId(heading.text, seenAnchors),
      });
      i += 1;
      continue;
    }

    const unordered = parseUnorderedListLine(current);
    if (unordered !== null) {
      const items: string[] = [];
      while (i < lines.length) {
        const item = parseUnorderedListLine(lines[i]);
        if (item === null) break;
        items.push(item);
        i += 1;
      }
      if (items.length) blocks.push({ kind: 'unordered_list', items });
      continue;
    }

    const ordered = parseOrderedListLine(current);
    if (ordered !== null) {
      const items: string[] = [];
      while (i < lines.length) {
        const item = parseOrderedListLine(lines[i]);
        if (item === null) break;
        items.push(item);
        i += 1;
      }
      if (items.length) blocks.push({ kind: 'ordered_list', items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) break;
      if (isHorizontalRuleLine(line)) break;
      if (parseHeadingLine(line)) break;
      if (parseUnorderedListLine(line) !== null) break;
      if (parseOrderedListLine(line) !== null) break;
      paragraphLines.push(line.replace(/\s+$/, ''));
      i += 1;
    }
    if (paragraphLines.length) blocks.push({ kind: 'paragraph', lines: paragraphLines });
  }

  return blocks;
}
