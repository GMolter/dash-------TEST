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
            return (
              <button
                key={`link-${idx}`}
                type="button"
                onMouseEnter={(e) => queueHoverPreview(hoverStateFromEvent(e))}
                onMouseMove={(e) => {
                  if (hover) {
                    setHover((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
                  }
                }}
                onMouseLeave={clearHoverPreview}
                onClick={() => {
                  if (isMissing) return;
                  onActivateInternalLink?.(link);
                }}
                className={`mx-0.5 inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                  isMissing
                    ? 'cursor-not-allowed border-red-500/45 bg-red-500/12 text-red-200'
                    : 'border-blue-500/35 bg-blue-500/12 text-blue-100 hover:bg-blue-500/22'
                }`}
                title={isMissing ? 'Reference unavailable' : undefined}
              >
                {isMissing ? `Missing: ${link.label}` : link.label}
              </button>
            );
          }

          return (
            <button
              key={`link-${idx}`}
              type="button"
              onMouseEnter={(e) => queueHoverPreview(hoverStateFromEvent(e))}
              onMouseMove={(e) => {
                if (hover) {
                  setHover((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
                }
              }}
              onMouseLeave={clearHoverPreview}
              onClick={() => {
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
              className="inline cursor-pointer border-none bg-transparent p-0 text-left align-baseline text-blue-300 underline decoration-blue-400/70 underline-offset-4 hover:text-blue-200"
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
