import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { ParsedMarkdownLink } from '../../lib/linking';
import { parseMarkdownLinks } from '../../lib/linking';
import { parseArticleBlocks } from '../../lib/helpArticleFormatting';
import { LinkHoverPreview } from './LinkHoverPreview';
import type { LinkResolvedMeta } from './types';

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
  if (!link.target || !link.target.type.startsWith('project_')) return '';
  if (link.target.type === 'project_file') return 'File';
  if (link.target.type === 'project_resource') return 'Resource';
  if (link.target.type === 'project_planner') return 'Planner';
  return 'Board';
}

export function LinkedContent({
  content,
  className,
  resolveMeta,
  resolveHelpHref,
  onActivateInternalLink,
  onActivateHelpTeleport,
}: LinkedContentProps) {
  const blocks = useMemo(() => parseArticleBlocks(content || ''), [content]);
  const [hover, setHover] = useState<HoverState | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

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

    if (typeof document === 'undefined') return;
    const node = document.getElementById(anchorId);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', `#${anchorId}`);
    }
  };

  const renderInlineSegments = (text: string, keyPrefix: string) => {
    const segments = parseMarkdownLinks(text || '');
    return segments.map((segment, idx) => {
      if (segment.kind === 'text') {
        return <span key={`${keyPrefix}-text-${idx}`}>{segment.text}</span>;
      }

      const { link } = segment;
      if (!link.target) {
        return <span key={`${keyPrefix}-malformed-${idx}`}>{link.raw}</span>;
      }

      const meta = resolveMeta
        ? resolveMeta(link)
        : {
            exists: true,
            title: link.label,
            subtitle: link.target.type === 'help_anchor' ? `#${link.target.anchorId}` : link.href,
          };

      const isInternal = link.target.type.startsWith('project_');
      const isTeleport = link.target.type === 'help_anchor';
      const isMissing = (isInternal || isTeleport) && !meta.exists;
      const actionHint = isMissing
        ? 'Reference unavailable'
        : isInternal
          ? 'Click to jump and highlight'
          : isTeleport
            ? 'Scrolls to section'
            : 'Opens in new tab';

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
            key={`${keyPrefix}-link-${idx}`}
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
                ? 'cursor-not-allowed border-red-500/50 bg-red-500/14 text-red-200'
                : 'border-cyan-400/40 bg-cyan-500/14 text-cyan-100 hover:bg-cyan-500/24 shadow-[0_0_0_1px_rgba(34,211,238,0.1)]'
            }`}
            title={isMissing ? 'Reference unavailable' : undefined}
          >
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                isMissing
                  ? 'border-red-400/40 bg-red-500/16 text-red-100'
                  : 'border-cyan-300/45 bg-cyan-400/16 text-cyan-100'
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
          key={`${keyPrefix}-link-${idx}`}
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
            if (link.target?.type === 'external') {
              window.open(link.target.url, '_blank', 'noopener,noreferrer');
              return;
            }
            if (link.target?.type === 'help') {
              const href = resolveHelpHref?.(link.target.articleId) || '/help';
              window.open(href, '_blank', 'noopener,noreferrer');
              return;
            }
            if (link.target?.type === 'help_anchor') {
              activateHelpTeleport(link.target.anchorId);
            }
          }}
          className={`inline cursor-pointer border-none bg-transparent p-0 text-left align-baseline font-medium underline underline-offset-4 ${
            isMissing
              ? 'text-red-300 decoration-red-300/70'
              : isTeleport
                ? 'text-teal-300 decoration-teal-300/70 hover:text-teal-200'
                : 'text-sky-300 decoration-sky-300/70 hover:text-cyan-200'
          }`}
          title={isMissing ? 'Reference unavailable' : undefined}
        >
          {link.label}
        </button>
      );
    });
  };

  return (
    <>
      <div className={className || 'text-sm leading-6 text-slate-100'}>
        {blocks.map((block, blockIdx) => {
          if (block.kind === 'heading') {
            const headingClass =
              block.level === 1
                ? 'scroll-mt-24 text-2xl font-semibold text-white'
                : block.level === 2
                  ? 'scroll-mt-24 text-xl font-semibold text-slate-100'
                  : block.level === 3
                    ? 'scroll-mt-24 text-lg font-semibold text-slate-100'
                    : 'scroll-mt-24 text-base font-semibold text-slate-100';

            if (block.level === 1) {
              return (
                <h1 key={`block-${blockIdx}`} id={block.anchorId} className={headingClass}>
                  {renderInlineSegments(block.text, `block-${blockIdx}`)}
                </h1>
              );
            }
            if (block.level === 2) {
              return (
                <h2 key={`block-${blockIdx}`} id={block.anchorId} className={headingClass}>
                  {renderInlineSegments(block.text, `block-${blockIdx}`)}
                </h2>
              );
            }
            if (block.level === 3) {
              return (
                <h3 key={`block-${blockIdx}`} id={block.anchorId} className={headingClass}>
                  {renderInlineSegments(block.text, `block-${blockIdx}`)}
                </h3>
              );
            }
            return (
              <h4 key={`block-${blockIdx}`} id={block.anchorId} className={headingClass}>
                {renderInlineSegments(block.text, `block-${blockIdx}`)}
              </h4>
            );
          }

          if (block.kind === 'unordered_list') {
            return (
              <ul
                key={`block-${blockIdx}`}
                className="list-disc space-y-1 pl-6 marker:text-slate-400"
              >
                {block.items.map((item, itemIdx) => (
                  <li key={`block-${blockIdx}-item-${itemIdx}`}>
                    {renderInlineSegments(item, `block-${blockIdx}-item-${itemIdx}`)}
                  </li>
                ))}
              </ul>
            );
          }

          if (block.kind === 'ordered_list') {
            return (
              <ol
                key={`block-${blockIdx}`}
                className="list-decimal space-y-1 pl-6 marker:text-slate-400"
              >
                {block.items.map((item, itemIdx) => (
                  <li key={`block-${blockIdx}-item-${itemIdx}`}>
                    {renderInlineSegments(item, `block-${blockIdx}-item-${itemIdx}`)}
                  </li>
                ))}
              </ol>
            );
          }

          return (
            <p key={`block-${blockIdx}`}>
              {block.lines.map((line, lineIdx) => (
                <span key={`block-${blockIdx}-line-${lineIdx}`}>
                  {renderInlineSegments(line, `block-${blockIdx}-line-${lineIdx}`)}
                  {lineIdx < block.lines.length - 1 ? <br /> : null}
                </span>
              ))}
            </p>
          );
        })}
      </div>

      <LinkHoverPreview
        visible={!!hover}
        x={hover?.x || 0}
        y={hover?.y || 0}
        title={hover?.title || ''}
        subtitle={hover?.subtitle}
        warning={hover?.warning}
        actionHint={hover?.actionHint}
      />
    </>
  );
}
