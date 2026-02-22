export type ArticleAnchor = {
  id: string;
  title: string;
  level: number;
};

export type TableAlignment = "left" | "center" | "right" | null;

export type ArticleBlock =
  | { kind: "heading"; level: number; text: string; anchorId: string }
  | { kind: "unordered_list"; items: string[] }
  | { kind: "ordered_list"; items: string[] }
  | { kind: "task_list"; items: { checked: boolean; text: string }[] }
  | { kind: "blockquote"; lines: { level: number; text: string }[] }
  | { kind: "code_block"; language?: string; code: string }
  | { kind: "table"; headers: string[]; aligns: TableAlignment[]; rows: string[][] }
  | { kind: "definition_list"; items: { term: string; definition: string }[] }
  | { kind: "horizontal_rule" }
  | { kind: "paragraph"; lines: string[] };

export type ParsedArticleDocument = {
  blocks: ArticleBlock[];
  referenceLinks: Record<string, string>;
  footnotes: Record<string, string>;
};

function normalizeContent(content: string): string {
  return (content || "").replace(/\r\n?/g, "\n");
}

function stripComments(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, "");
}

function normalizeLinkHref(rawHref: string): string {
  const value = rawHref.trim();
  if (value.startsWith("<") && value.endsWith(">")) return value.slice(1, -1).trim();
  return value;
}

function toAnchorSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueAnchorId(raw: string, seen: Map<string, number>): string {
  const base = toAnchorSlug(raw) || "section";
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  if (count === 0) return base;
  return `${base}-${count + 1}`;
}

function parseHeadingLine(line: string): { level: number; text: string } | null {
  const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
  if (!match) return null;
  const level = Math.min(match[1].length, 6);
  const text = match[2].replace(/\s+#+\s*$/, "").trim();
  if (!text) return null;
  return { level, text };
}

function parseUnorderedListLine(line: string): string | null {
  const match = line.match(/^\s{0,3}(?:[-*+]|\u2022)(?:\s+(.*)|\s*)$/);
  if (!match) return null;
  return (match[1] || "").trim();
}

function parseOrderedListLine(line: string): string | null {
  const match = line.match(/^\s{0,3}\d+\.(?:\s+(.*)|\s*)$/);
  if (!match) return null;
  return (match[1] || "").trim();
}

function parseTaskListLine(line: string): { checked: boolean; text: string } | null {
  const match = line.match(/^\s{0,3}(?:[-*+]|\u2022)\s+\[(x|X| )\]\s*(.*)\s*$/);
  if (!match) return null;
  return { checked: match[1].toLowerCase() === "x", text: match[2].trim() };
}

function parseBlockquoteLine(line: string): { level: number; text: string } | null {
  let rest = line.trimStart();
  if (!rest.startsWith(">")) return null;

  let level = 0;
  while (rest.startsWith(">")) {
    level += 1;
    rest = rest.slice(1);
    if (rest.startsWith(" ")) rest = rest.slice(1);
  }
  return { level: Math.max(level, 1), text: rest };
}

function isHorizontalRuleLine(line: string): boolean {
  return /^\s{0,3}(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line);
}

function parseFencedStart(line: string): { language?: string } | null {
  const match = line.match(/^\s*```([A-Za-z0-9_-]+)?\s*$/);
  if (!match) return null;
  return { language: match[1] || undefined };
}

function isFencedEnd(line: string): boolean {
  return /^\s*```\s*$/.test(line);
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?:\t| {4})/.test(line);
}

function unindentCodeLine(line: string): string {
  if (line.startsWith("\t")) return line.slice(1);
  if (line.startsWith("    ")) return line.slice(4);
  return line;
}

function splitTableRow(line: string): string[] | null {
  if (!line.includes("|")) return null;
  let raw = line.trim();
  if (raw.startsWith("|")) raw = raw.slice(1);
  if (raw.endsWith("|")) raw = raw.slice(0, -1);
  const cells = raw.split("|").map((cell) => cell.trim());
  return cells.length > 1 ? cells : null;
}

function parseTableAlignRow(line: string): TableAlignment[] | null {
  const cells = splitTableRow(line);
  if (!cells || cells.length < 2) return null;
  const aligns: TableAlignment[] = [];

  for (const cell of cells) {
    if (!/^:?-{3,}:?$/.test(cell)) return null;
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) aligns.push("center");
    else if (right) aligns.push("right");
    else if (left) aligns.push("left");
    else aligns.push(null);
  }
  return aligns;
}

function isTableStart(lines: string[], index: number): boolean {
  const header = splitTableRow(lines[index] || "");
  if (!header) return false;
  const align = parseTableAlignRow(lines[index + 1] || "");
  return !!align && align.length >= 2;
}

function parseDefinitionStart(lines: string[], index: number): boolean {
  return !!lines[index]?.trim() && /^:\s+/.test(lines[index + 1] || "");
}

function parseReferenceDefinition(line: string): { id: string; href: string } | null {
  const match = line.match(/^\[([^\]\n]+)\]:\s*(<[^>\n]+>|[^\s]+)(?:\s+"[^"\n]*")?\s*$/);
  if (!match) return null;
  if (match[1].trim().startsWith("^")) return null;
  return { id: match[1].trim().toLowerCase(), href: normalizeLinkHref(match[2]) };
}

function parseFootnoteDefinition(line: string): { id: string; text: string } | null {
  const match = line.match(/^\[\^([^\]\n]+)\]:\s*(.+)\s*$/);
  if (!match) return null;
  return { id: match[1].trim(), text: match[2].trim() };
}

export function extractArticleAnchors(content: string): ArticleAnchor[] {
  const lines = stripComments(normalizeContent(content)).split("\n");
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

export function parseArticleDocument(content: string): ParsedArticleDocument {
  const inputLines = stripComments(normalizeContent(content)).split("\n");
  const referenceLinks: Record<string, string> = {};
  const footnotes: Record<string, string> = {};
  const lines: string[] = [];
  let inFencedCode = false;

  for (const line of inputLines) {
    if (inFencedCode) {
      lines.push(line);
      if (isFencedEnd(line)) inFencedCode = false;
      continue;
    }

    if (parseFencedStart(line)) {
      inFencedCode = true;
      lines.push(line);
      continue;
    }

    if (isIndentedCodeLine(line)) {
      lines.push(line);
      continue;
    }

    const footDef = parseFootnoteDefinition(line);
    if (footDef) {
      footnotes[footDef.id] = footDef.text;
      continue;
    }

    const refDef = parseReferenceDefinition(line);
    if (refDef) {
      referenceLinks[refDef.id] = refDef.href;
      continue;
    }

    lines.push(line);
  }

  const blocks: ArticleBlock[] = [];
  const seenAnchors = new Map<string, number>();
  let i = 0;

  const isBlockStarter = (line: string, index: number): boolean => {
    if (!line.trim()) return true;
    if (isHorizontalRuleLine(line)) return true;
    if (parseHeadingLine(line)) return true;
    if (parseFencedStart(line)) return true;
    if (isIndentedCodeLine(line)) return true;
    if (parseBlockquoteLine(line)) return true;
    if (parseTaskListLine(line)) return true;
    if (parseUnorderedListLine(line) !== null) return true;
    if (parseOrderedListLine(line) !== null) return true;
    if (isTableStart(lines, index)) return true;
    if (parseDefinitionStart(lines, index)) return true;
    return false;
  };

  while (i < lines.length) {
    const current = lines[i];

    if (!current.trim()) {
      i += 1;
      continue;
    }

    const fenced = parseFencedStart(current);
    if (fenced) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !isFencedEnd(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && isFencedEnd(lines[i])) i += 1;
      blocks.push({ kind: "code_block", language: fenced.language, code: codeLines.join("\n") });
      continue;
    }

    if (isIndentedCodeLine(current)) {
      const codeLines: string[] = [];
      while (i < lines.length && (isIndentedCodeLine(lines[i]) || !lines[i].trim())) {
        codeLines.push(lines[i].trim() ? unindentCodeLine(lines[i]) : "");
        i += 1;
      }
      blocks.push({ kind: "code_block", code: codeLines.join("\n") });
      continue;
    }

    if (isHorizontalRuleLine(current)) {
      blocks.push({ kind: "horizontal_rule" });
      i += 1;
      continue;
    }

    const heading = parseHeadingLine(current);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading.level,
        text: heading.text,
        anchorId: uniqueAnchorId(heading.text, seenAnchors),
      });
      i += 1;
      continue;
    }

    const quote = parseBlockquoteLine(current);
    if (quote) {
      const quoteLines: { level: number; text: string }[] = [];
      while (i < lines.length) {
        const hit = parseBlockquoteLine(lines[i]);
        if (!hit) break;
        quoteLines.push(hit);
        i += 1;
      }
      blocks.push({ kind: "blockquote", lines: quoteLines });
      continue;
    }

    const task = parseTaskListLine(current);
    if (task) {
      const items: { checked: boolean; text: string }[] = [];
      while (i < lines.length) {
        const hit = parseTaskListLine(lines[i]);
        if (!hit) break;
        items.push(hit);
        i += 1;
      }
      blocks.push({ kind: "task_list", items });
      continue;
    }

    const unordered = parseUnorderedListLine(current);
    if (unordered !== null) {
      const items: string[] = [];
      while (i < lines.length) {
        const hit = parseUnorderedListLine(lines[i]);
        if (hit === null) break;
        items.push(hit);
        i += 1;
      }
      blocks.push({ kind: "unordered_list", items });
      continue;
    }

    const ordered = parseOrderedListLine(current);
    if (ordered !== null) {
      const items: string[] = [];
      while (i < lines.length) {
        const hit = parseOrderedListLine(lines[i]);
        if (hit === null) break;
        items.push(hit);
        i += 1;
      }
      blocks.push({ kind: "ordered_list", items });
      continue;
    }

    if (isTableStart(lines, i)) {
      const headers = splitTableRow(lines[i]) || [];
      const aligns = parseTableAlignRow(lines[i + 1]) || headers.map(() => null);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length) {
        const row = splitTableRow(lines[i]);
        if (!row) break;
        rows.push(row);
        i += 1;
      }
      blocks.push({ kind: "table", headers, aligns, rows });
      continue;
    }

    if (parseDefinitionStart(lines, i)) {
      const items: { term: string; definition: string }[] = [];
      while (i < lines.length && parseDefinitionStart(lines, i)) {
        const term = (lines[i] || "").trim();
        i += 1;

        const defs: string[] = [];
        while (i < lines.length && /^:\s+/.test(lines[i])) {
          defs.push(lines[i].replace(/^:\s+/, "").trim());
          i += 1;
        }

        items.push({ term, definition: defs.join(" ") });
      }
      blocks.push({ kind: "definition_list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) break;
      if (isBlockStarter(line, i) && paragraphLines.length > 0) break;
      paragraphLines.push(line.replace(/\s+$/, ""));
      i += 1;
      if (i < lines.length && isBlockStarter(lines[i], i)) break;
    }
    if (paragraphLines.length) blocks.push({ kind: "paragraph", lines: paragraphLines });
  }

  return { blocks, referenceLinks, footnotes };
}

export function parseArticleBlocks(content: string): ArticleBlock[] {
  return parseArticleDocument(content).blocks;
}
