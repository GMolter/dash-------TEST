import { useMemo, useRef, useState } from 'react';
import type { ParsedMarkdownLink } from '../../lib/linking';
import { parseMarkdownLinks } from '../../lib/linking';
import { LinkHoverPreview } from './LinkHoverPreview';
import type { LinkResolvedMeta } from './types';

type LinkedContentProps = {
  content: string;
  className?: string;
  resolveMeta?: (link: ParsedMarkdownLink) => LinkResolvedMeta;
  resolveHelpHref?: (articleId: string) => string | null;
  onActivateInternalLink?: (link: ParsedMarkdownLink) => void;
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

function renderTextFragment(text: string, keyPrefix: string) {
  const lines = text.split('\n');
  return lines.map((line, idx) => (
    <span key={`${keyPrefix}-line-${idx}`}>
      {line}
      {idx < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

export function LinkedContent({
  content,
  className,
  resolveMeta,
  resolveHelpHref,
  onActivateInternalLink,
}: LinkedContentProps) {
  const segments = useMemo(() => parseMarkdownLinks(content || ''), [content]);
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

  return (
    <>
      <div className={className || 'text-sm leading-6 text-slate-100 whitespace-pre-wrap'}>
        {segments.map((segment, idx) => {
          if (segment.kind === 'text') {
            return <span key={`text-${idx}`}>{renderTextFragment(segment.text, `text-${idx}`)}</span>;
          }

          const { link } = segment;
          if (!link.target) {
            return <span key={`malformed-${idx}`}>{link.raw}</span>;
          }

          const meta = resolveMeta
            ? resolveMeta(link)
            : {
                exists: true,
                title: link.label,
                subtitle: link.href,
              };

          const isInternal = link.target.type.startsWith('project_');
          const isMissing = isInternal && !meta.exists;
          const actionHint = isMissing
            ? 'Reference unavailable'
            : isInternal
              ? 'Click to jump and highlight'
              : 'Opens in new tab';

          const hoverStateFromEvent = (e: React.MouseEvent): HoverState => ({
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
                key={`link-${idx}`}
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
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                  isMissing
                    ? 'border-red-400/40 bg-red-500/16 text-red-100'
                    : 'border-cyan-300/45 bg-cyan-400/16 text-cyan-100'
                }`}>
                  {badgeLabel}
                </span>
                <span className="truncate">{isMissing ? `Missing: ${link.label}` : link.label}</span>
              </button>
            );
          }

          return (
            <button
              key={`link-${idx}`}
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
                if (link.target?.type === 'external') {
                  window.open(link.target.url, '_blank', 'noopener,noreferrer');
                  return;
                }
                if (link.target?.type === 'help') {
                  const href = resolveHelpHref?.(link.target.articleId) || '/help';
                  window.open(href, '_blank', 'noopener,noreferrer');
                  return;
                }
              }}
              className="inline cursor-pointer border-none bg-transparent p-0 text-left align-baseline font-medium text-sky-300 underline decoration-sky-300/70 underline-offset-4 hover:text-cyan-200"
            >
              {link.label}
            </button>
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
