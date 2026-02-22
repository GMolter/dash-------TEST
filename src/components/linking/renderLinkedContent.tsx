import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import type { LinkTarget, ParsedMarkdownLink } from "../../lib/linking";
import { parseLinkTarget } from "../../lib/linking";
import { parseArticleDocument } from "../../lib/helpArticleFormatting";
import { LinkHoverPreview } from "./LinkHoverPreview";
import type { LinkResolvedMeta } from "./types";

type LinkedContentProps = {
  content: string;
  className?: string;
  resolveMeta?: (link: ParsedMarkdownLink) => LinkResolvedMeta;
  resolveHelpHref?: (articleId: string) => string | null;
  onActivateInternalLink?: (link: ParsedMarkdownLink) => void;
  onActivateHelpTeleport?: (anchorId: string) => void;
};

type HoverState = {
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  warning?: string;
  actionHint?: string;
};

function internalBadgeLabel(link: ParsedMarkdownLink) {
  if (!link.target || !link.target.type.startsWith("project_")) return "";
  if (link.target.type === "project_file") return "File";
  if (link.target.type === "project_resource") return "Resource";
  if (link.target.type === "project_planner") return "Planner";
  return "Board";
}

function markdownHref(rawHref: string): string {
  const value = rawHref.trim();
  if (value.startsWith("<") && value.endsWith(">")) return value.slice(1, -1).trim();
  return value;
}

function makeParsedLink(label: string, href: string, target: LinkTarget | null): ParsedMarkdownLink {
  return {
    raw: `[${label}](${href})`,
    label,
    href,
    start: 0,
    end: 0,
    target,
  };
}

export function LinkedContent({
  content,
  className,
  resolveMeta,
  resolveHelpHref,
  onActivateInternalLink,
  onActivateHelpTeleport,
}: LinkedContentProps) {
  const doc = useMemo(() => parseArticleDocument(content || ""), [content]);
  const [hover, setHover] = useState<HoverState | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const footnoteOrder = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    const source = (content || "").replace(/^\[\^[^\]\n]+\]:.*$/gm, "");
    const refs = source.matchAll(/\[\^([^\]\n]+)\]/g);
    for (const match of refs) {
      const id = match[1]?.trim();
      if (!id || seen.has(id) || !doc.footnotes[id]) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }, [content, doc.footnotes]);

  const footnoteIndex = useMemo(() => {
    const map = new Map<string, number>();
    footnoteOrder.forEach((id, idx) => map.set(id, idx + 1));
    return map;
  }, [footnoteOrder]);

  const queueHoverPreview = (state: HoverState) => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    hoverTimerRef.current = window.setTimeout(() => {
      setHover(state);
      hoverTimerRef.current = null;
    }, 1000);
  };

  const clearHoverPreview = () => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHover(null);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  }, []);

  const activateHelpTeleport = (anchorId: string) => {
    if (onActivateHelpTeleport) {
      onActivateHelpTeleport(anchorId);
      return;
    }

    if (typeof document === "undefined") return;
    const node = document.getElementById(anchorId);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    if (typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState(null, "", `#${anchorId}`);
    }
  };

  const renderInlineMarkdown = (text: string, keyPrefix: string, depth = 0): ReactNode[] => {
    if (!text) return [""];
    if (depth > 12) return [text];

    const nodes: ReactNode[] = [];
    let buffer = "";
    let i = 0;
    let part = 0;

    const flush = () => {
      if (!buffer) return;
      nodes.push(<span key={`${keyPrefix}-txt-${part++}`}>{buffer}</span>);
      buffer = "";
    };

    const pushStyled = (
      marker: string,
      render: (children: ReactNode[], key: string) => ReactNode,
    ): boolean => {
      if (!text.startsWith(marker, i)) return false;
      const close = text.indexOf(marker, i + marker.length);
      if (close === -1) return false;
      const inner = text.slice(i + marker.length, close);
      if (!inner) return false;
      flush();
      const innerNodes = renderInlineMarkdown(inner, `${keyPrefix}-m-${part}`, depth + 1);
      const key = `${keyPrefix}-m-${part++}`;
      nodes.push(render(innerNodes, key));
      i = close + marker.length;
      return true;
    };

    while (i < text.length) {
      if (text[i] === "\\" && i + 1 < text.length) {
        buffer += text[i + 1];
        i += 2;
        continue;
      }

      const slice = text.slice(i);

      const brMatch = slice.match(/^<br\s*\/?>/i);
      if (brMatch) {
        flush();
        nodes.push(<br key={`${keyPrefix}-br-${part++}`} />);
        i += brMatch[0].length;
        continue;
      }

      const underlineMatch = slice.match(/^<u>([\s\S]*?)<\/u>/i);
      if (underlineMatch) {
        flush();
        const inner = underlineMatch[1] || "";
        nodes.push(
          <u key={`${keyPrefix}-u-${part++}`}>
            {renderInlineMarkdown(inner, `${keyPrefix}-u-inner-${part}`, depth + 1)}
          </u>,
        );
        i += underlineMatch[0].length;
        continue;
      }

      const boldHtmlMatch = slice.match(/^<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/i);
      if (boldHtmlMatch) {
        flush();
        const inner = boldHtmlMatch[1] || "";
        nodes.push(
          <strong key={`${keyPrefix}-b-${part++}`}>
            {renderInlineMarkdown(inner, `${keyPrefix}-b-inner-${part}`, depth + 1)}
          </strong>,
        );
        i += boldHtmlMatch[0].length;
        continue;
      }

      const italicHtmlMatch = slice.match(/^<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/i);
      if (italicHtmlMatch) {
        flush();
        const inner = italicHtmlMatch[1] || "";
        nodes.push(
          <em key={`${keyPrefix}-i-${part++}`}>
            {renderInlineMarkdown(inner, `${keyPrefix}-i-inner-${part}`, depth + 1)}
          </em>,
        );
        i += italicHtmlMatch[0].length;
        continue;
      }

      const detailsMatch = slice.match(/^<details>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)<\/details>/i);
      if (detailsMatch) {
        flush();
        const summary = detailsMatch[1] || "Details";
        const body = detailsMatch[2] || "";
        nodes.push(
          <details key={`${keyPrefix}-details-${part++}`} className="my-2 rounded-lg border border-slate-700/70 bg-slate-900/45 px-3 py-2">
            <summary className="cursor-pointer text-slate-100">
              {renderInlineMarkdown(summary, `${keyPrefix}-details-summary-${part}`, depth + 1)}
            </summary>
            <div className="mt-2 text-slate-300">
              {renderInlineMarkdown(body, `${keyPrefix}-details-body-${part}`, depth + 1)}
            </div>
          </details>,
        );
        i += detailsMatch[0].length;
        continue;
      }

      if (text[i] === "`") {
        const close = text.indexOf("`", i + 1);
        if (close !== -1) {
          flush();
          nodes.push(
            <code
              key={`${keyPrefix}-code-${part++}`}
              className="rounded bg-slate-900/80 px-1 py-0.5 font-mono text-[0.92em] text-emerald-200"
            >
              {text.slice(i + 1, close)}
            </code>,
          );
          i = close + 1;
          continue;
        }
      }

      const mdLinkMatch = slice.match(/^\[([^\]\n]+)\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"([^"\n]*)")?\s*\)/);
      if (mdLinkMatch) {
        const label = mdLinkMatch[1];
        const href = markdownHref(mdLinkMatch[2]);
        const target = href.startsWith("#")
          ? ({ type: "help_anchor", anchorId: href.replace(/^#/, "") } satisfies LinkTarget)
          : parseLinkTarget(href);
        const link = makeParsedLink(label, href, target);

        flush();
        nodes.push(renderLink(link, `${keyPrefix}-link-${part++}`));
        i += mdLinkMatch[0].length;
        continue;
      }

      const refLinkMatch = slice.match(/^\[([^\]\n]+)\]\[([^\]\n]+)\]/);
      if (refLinkMatch) {
        const label = refLinkMatch[1];
        const refId = refLinkMatch[2].trim().toLowerCase();
        const refHref = doc.referenceLinks[refId];
        if (refHref) {
          const target = refHref.startsWith("#")
            ? ({ type: "help_anchor", anchorId: refHref.replace(/^#/, "") } satisfies LinkTarget)
            : parseLinkTarget(refHref);
          const link = makeParsedLink(label, refHref, target);
          flush();
          nodes.push(renderLink(link, `${keyPrefix}-reflink-${part++}`));
          i += refLinkMatch[0].length;
          continue;
        }
      }

      const footRefMatch = slice.match(/^\[\^([^\]\n]+)\]/);
      if (footRefMatch) {
        const footId = footRefMatch[1].trim();
        const footNo = footnoteIndex.get(footId);
        if (footNo) {
          flush();
          nodes.push(
            <sup key={`${keyPrefix}-footref-${part++}`} className="mx-0.5">
              <a
                href={`#fn-${footId}`}
                className="text-cyan-300 underline decoration-cyan-300/70 underline-offset-4 hover:text-cyan-200"
              >
                {footNo}
              </a>
            </sup>,
          );
          i += footRefMatch[0].length;
          continue;
        }
      }

      const autoLinkMatch = slice.match(/^<((?:https?:\/\/|mailto:)[^>\s]+)>/i);
      if (autoLinkMatch) {
        const href = autoLinkMatch[1];
        const target = parseLinkTarget(href);
        const link = makeParsedLink(href, href, target);
        flush();
        nodes.push(renderLink(link, `${keyPrefix}-autolink-${part++}`));
        i += autoLinkMatch[0].length;
        continue;
      }

      if (pushStyled("***", (children, key) => <strong key={key}><em>{children}</em></strong>)) continue;
      if (pushStyled("___", (children, key) => <strong key={key}><em>{children}</em></strong>)) continue;
      if (pushStyled("**", (children, key) => <strong key={key}>{children}</strong>)) continue;
      if (pushStyled("__", (children, key) => <strong key={key}>{children}</strong>)) continue;
      if (pushStyled("~~", (children, key) => <del key={key}>{children}</del>)) continue;
      if (pushStyled("==", (children, key) => <mark key={key} className="rounded bg-yellow-300/30 px-0.5 text-yellow-100">{children}</mark>)) continue;
      if (pushStyled("*", (children, key) => <em key={key}>{children}</em>)) continue;
      if (pushStyled("_", (children, key) => <em key={key}>{children}</em>)) continue;
      if (pushStyled("^", (children, key) => <sup key={key}>{children}</sup>)) continue;
      if (pushStyled("~", (children, key) => <sub key={key}>{children}</sub>)) continue;

      buffer += text[i];
      i += 1;
    }

    flush();
    return nodes.length ? nodes : [text];
  };

  const renderLink = (link: ParsedMarkdownLink, key: string): ReactNode => {
    const meta = resolveMeta
      ? resolveMeta(link)
      : {
          exists: true,
          title: link.label,
          subtitle:
            link.target?.type === "help_anchor"
              ? `#${link.target.anchorId}`
              : link.href,
        };

    const isInternal = !!link.target && link.target.type.startsWith("project_");
    const isTeleport = !!link.target && link.target.type === "help_anchor";
    const isMissing = (isInternal || isTeleport) && !meta.exists;
    const actionHint = isMissing
      ? "Reference unavailable"
      : isInternal
        ? "Click to jump and highlight"
        : isTeleport
          ? "Scrolls to section"
          : "Opens in new tab";

    const hoverStateFromEvent = (e: MouseEvent): HoverState => ({
      x: e.clientX,
      y: e.clientY,
      title: meta.title || link.label,
      subtitle: meta.subtitle,
      warning: meta.warning,
      actionHint,
    });

    if (isInternal) {
      const badgeLabel = internalBadgeLabel(link);
      return (
        <button
          key={key}
          type="button"
          data-linked-content-link="true"
          onMouseEnter={(e) => queueHoverPreview(hoverStateFromEvent(e))}
          onMouseMove={(e) => {
            if (hover) {
              setHover((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
            }
          }}
          onMouseLeave={clearHoverPreview}
          onClick={(e) => {
            e.stopPropagation();
            if (isMissing) return;
            onActivateInternalLink?.(link);
          }}
          className={`mx-0.5 inline-flex items-center gap-1 rounded-2xl border px-2.5 py-1 text-[11px] font-medium transition-colors ${
            isMissing
              ? "cursor-not-allowed border-red-500/50 bg-red-500/14 text-red-200"
              : "border-cyan-400/40 bg-cyan-500/14 text-cyan-100 hover:bg-cyan-500/24 shadow-[0_0_0_1px_rgba(34,211,238,0.1)]"
          }`}
          title={isMissing ? "Reference unavailable" : undefined}
        >
          <span
            className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
              isMissing
                ? "border-red-400/40 bg-red-500/16 text-red-100"
                : "border-cyan-300/45 bg-cyan-400/16 text-cyan-100"
            }`}
          >
            {badgeLabel}
          </span>
          <span className="truncate">{isMissing ? `Missing: ${link.label}` : link.label}</span>
        </button>
      );
    }

    return (
      <button
        key={key}
        type="button"
        data-linked-content-link="true"
        onMouseEnter={(e) => queueHoverPreview(hoverStateFromEvent(e))}
        onMouseMove={(e) => {
          if (hover) {
            setHover((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
          }
        }}
        onMouseLeave={clearHoverPreview}
        onClick={(e) => {
          e.stopPropagation();
          if (isMissing) return;

          if (link.target?.type === "external") {
            window.open(link.target.url, "_blank", "noopener,noreferrer");
            return;
          }

          if (link.target?.type === "help") {
            const href = resolveHelpHref?.(link.target.articleId) || "/help";
            window.open(href, "_blank", "noopener,noreferrer");
            return;
          }

          if (link.target?.type === "help_anchor") {
            activateHelpTeleport(link.target.anchorId);
            return;
          }

          if (link.href.startsWith("#")) {
            activateHelpTeleport(link.href.replace(/^#/, ""));
            return;
          }

          window.open(link.href, "_blank", "noopener,noreferrer");
        }}
        className={`inline cursor-pointer border-none bg-transparent p-0 text-left align-baseline font-medium underline underline-offset-4 break-all ${
          isMissing
            ? "text-red-300 decoration-red-300/70"
            : isTeleport
              ? "text-teal-300 decoration-teal-300/70 hover:text-teal-200"
              : "text-sky-300 decoration-sky-300/70 hover:text-cyan-200"
        }`}
        title={isMissing ? "Reference unavailable" : undefined}
      >
        {link.label}
      </button>
    );
  };

  return (
    <>
      <div className={className || "text-sm leading-6 text-slate-100 break-words [overflow-wrap:anywhere]"}>
        {doc.blocks.map((block, blockIdx) => {
          if (block.kind === "heading") {
            const headingClass =
              block.level === 1
                ? "scroll-mt-24 text-2xl font-semibold text-white"
                : block.level === 2
                  ? "scroll-mt-24 text-xl font-semibold text-slate-100"
                  : block.level === 3
                    ? "scroll-mt-24 text-lg font-semibold text-slate-100"
                    : "scroll-mt-24 text-base font-semibold text-slate-100";

            if (block.level === 1) {
              return (
                <h1 key={`block-${blockIdx}`} id={block.anchorId} className={headingClass}>
                  {renderInlineMarkdown(block.text, `block-${blockIdx}`)}
                </h1>
              );
            }
            if (block.level === 2) {
              return (
                <h2 key={`block-${blockIdx}`} id={block.anchorId} className={headingClass}>
                  {renderInlineMarkdown(block.text, `block-${blockIdx}`)}
                </h2>
              );
            }
            if (block.level === 3) {
              return (
                <h3 key={`block-${blockIdx}`} id={block.anchorId} className={headingClass}>
                  {renderInlineMarkdown(block.text, `block-${blockIdx}`)}
                </h3>
              );
            }
            return (
              <h4 key={`block-${blockIdx}`} id={block.anchorId} className={headingClass}>
                {renderInlineMarkdown(block.text, `block-${blockIdx}`)}
              </h4>
            );
          }

          if (block.kind === "unordered_list") {
            return (
              <ul key={`block-${blockIdx}`} className="list-disc space-y-1 pl-6 marker:text-slate-400">
                {block.items.map((item, itemIdx) => (
                  <li key={`block-${blockIdx}-item-${itemIdx}`}>
                    {renderInlineMarkdown(item, `block-${blockIdx}-item-${itemIdx}`)}
                  </li>
                ))}
              </ul>
            );
          }

          if (block.kind === "ordered_list") {
            return (
              <ol key={`block-${blockIdx}`} className="list-decimal space-y-1 pl-6 marker:text-slate-400">
                {block.items.map((item, itemIdx) => (
                  <li key={`block-${blockIdx}-item-${itemIdx}`}>
                    {renderInlineMarkdown(item, `block-${blockIdx}-item-${itemIdx}`)}
                  </li>
                ))}
              </ol>
            );
          }

          if (block.kind === "task_list") {
            return (
              <ul key={`block-${blockIdx}`} className="space-y-2 pl-1">
                {block.items.map((item, itemIdx) => (
                  <li key={`block-${blockIdx}-item-${itemIdx}`} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      readOnly
                      className="mt-1 h-4 w-4 accent-cyan-400"
                    />
                    <span>{renderInlineMarkdown(item.text, `block-${blockIdx}-task-${itemIdx}`)}</span>
                  </li>
                ))}
              </ul>
            );
          }

          if (block.kind === "blockquote") {
            return (
              <div key={`block-${blockIdx}`} className="space-y-2 border-l-2 border-slate-700/90 pl-4 text-slate-300">
                {block.lines.map((line, lineIdx) => (
                  <div
                    key={`block-${blockIdx}-quote-${lineIdx}`}
                    style={{ marginLeft: `${Math.max(0, line.level - 1) * 14}px` }}
                    className="border-l border-slate-700/60 pl-3"
                  >
                    {renderInlineMarkdown(line.text, `block-${blockIdx}-quote-${lineIdx}`)}
                  </div>
                ))}
              </div>
            );
          }

          if (block.kind === "code_block") {
            return (
              <div key={`block-${blockIdx}`} className="rounded-xl border border-slate-700/70 bg-slate-950/75">
                {block.language ? (
                  <div className="border-b border-slate-700/70 px-3 py-1.5 text-[11px] uppercase tracking-wide text-slate-400">
                    {block.language}
                  </div>
                ) : null}
                <pre className="overflow-x-auto p-3 text-xs leading-6 text-emerald-200">
                  <code>{block.code}</code>
                </pre>
              </div>
            );
          }

          if (block.kind === "table") {
            return (
              <div key={`block-${blockIdx}`} className="overflow-x-auto rounded-xl border border-slate-700/70">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-slate-900/70">
                    <tr>
                      {block.headers.map((cell, cellIdx) => (
                        <th
                          key={`block-${blockIdx}-head-${cellIdx}`}
                          className="border-b border-slate-700/70 px-3 py-2 text-left font-semibold text-slate-100"
                          style={{ textAlign: block.aligns[cellIdx] || "left" }}
                        >
                          {renderInlineMarkdown(cell, `block-${blockIdx}-head-${cellIdx}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIdx) => (
                      <tr key={`block-${blockIdx}-row-${rowIdx}`} className="border-t border-slate-700/40">
                        {block.headers.map((_, cellIdx) => (
                          <td
                            key={`block-${blockIdx}-row-${rowIdx}-cell-${cellIdx}`}
                            className="px-3 py-2 text-slate-200"
                            style={{ textAlign: block.aligns[cellIdx] || "left" }}
                          >
                            {renderInlineMarkdown(row[cellIdx] || "", `block-${blockIdx}-row-${rowIdx}-cell-${cellIdx}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          if (block.kind === "definition_list") {
            return (
              <dl key={`block-${blockIdx}`} className="space-y-2">
                {block.items.map((item, itemIdx) => (
                  <div key={`block-${blockIdx}-def-${itemIdx}`} className="rounded-lg border border-slate-700/60 bg-slate-900/35 p-3">
                    <dt className="font-semibold text-slate-100">
                      {renderInlineMarkdown(item.term, `block-${blockIdx}-def-term-${itemIdx}`)}
                    </dt>
                    <dd className="mt-1 text-slate-300">
                      {renderInlineMarkdown(item.definition, `block-${blockIdx}-def-body-${itemIdx}`)}
                    </dd>
                  </div>
                ))}
              </dl>
            );
          }

          if (block.kind === "horizontal_rule") {
            return <hr key={`block-${blockIdx}`} className="my-3 border-slate-700/80" />;
          }

          return (
            <p key={`block-${blockIdx}`}>
              {block.lines.map((line, lineIdx) => (
                <span key={`block-${blockIdx}-line-${lineIdx}`}>
                  {renderInlineMarkdown(line, `block-${blockIdx}-line-${lineIdx}`)}
                  {lineIdx < block.lines.length - 1 ? <br /> : null}
                </span>
              ))}
            </p>
          );
        })}

        {footnoteOrder.length > 0 ? (
          <section className="mt-6 border-t border-slate-700/70 pt-4">
            <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">Footnotes</h4>
            <ol className="list-decimal space-y-2 pl-6 marker:text-slate-400">
              {footnoteOrder.map((id) => (
                <li key={`fn-${id}`} id={`fn-${id}`} className="text-slate-300">
                  {renderInlineMarkdown(doc.footnotes[id] || "", `footnote-${id}`)}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>

      <LinkHoverPreview
        visible={!!hover}
        x={hover?.x || 0}
        y={hover?.y || 0}
        title={hover?.title || ""}
        subtitle={hover?.subtitle}
        warning={hover?.warning}
        actionHint={hover?.actionHint}
      />
    </>
  );
}
