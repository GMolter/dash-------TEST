import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Home } from 'lucide-react';
import { LinkedContent } from '../components/linking/renderLinkedContent';
import type { LinkResolvedMeta } from '../components/linking/types';
import type { ParsedMarkdownLink } from '../lib/linking';
import { extractArticleAnchors } from '../lib/helpArticleFormatting';

type Article = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  updated_at: string;
};

type HelpLinkRef = {
  id: string;
  slug: string;
  title: string;
};

export function HelpArticlePage({ slug }: { slug: string }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [helpRefs, setHelpRefs] = useState<HelpLinkRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMissing(false);

    async function load() {
      try {
        const r = await fetch(`/api/public/help-article?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
        if (r.status === 404) {
          if (!cancelled) setMissing(true);
          return;
        }
        const j = await r.json();
        const refsRes = await fetch('/api/public/help-articles', { cache: 'no-store' });
        const refsJson = await refsRes.json().catch(() => ({}));
        if (!cancelled) {
          setArticle(j.article || null);
          setHelpRefs(Array.isArray(refsJson.articles) ? (refsJson.articles as HelpLinkRef[]) : []);
        }
      } catch {
        if (!cancelled) setMissing(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const resolveHelpHref = useMemo(() => {
    const byId = new Map(helpRefs.map((item) => [item.id, item]));
    return (articleId: string) => {
      const hit = byId.get(articleId);
      if (!hit) return '/help';
      return `/help/article/${hit.slug}`;
    };
  }, [helpRefs]);

  const articleAnchors = useMemo(
    () => extractArticleAnchors(article?.content || ''),
    [article?.content],
  );

  const resolveMeta = useMemo(() => {
    const byId = new Map(helpRefs.map((item) => [item.id, item]));
    const anchorById = new Map(articleAnchors.map((anchor) => [anchor.id, anchor]));
    return (link: ParsedMarkdownLink): LinkResolvedMeta => {
      if (!link.target) {
        return { exists: false, title: link.label, subtitle: 'Invalid link format' };
      }
      if (link.target.type === 'external') {
        return {
          exists: true,
          title: link.label,
          subtitle: link.target.url,
        };
      }
      if (link.target.type === 'help') {
        const articleRef = byId.get(link.target.articleId);
        if (!articleRef) {
          return {
            exists: false,
            title: link.label,
            subtitle: 'Help article unavailable',
          };
        }
        return {
          exists: true,
          title: articleRef.title,
          subtitle: `/help/article/${articleRef.slug}`,
        };
      }
      if (link.target.type === 'help_anchor') {
        const anchor = anchorById.get(link.target.anchorId);
        if (!anchor) {
          return {
            exists: false,
            title: link.label,
            subtitle: `Section unavailable (#${link.target.anchorId})`,
          };
        }
        return {
          exists: true,
          title: anchor.title,
          subtitle: `Jump to #${anchor.id}`,
        };
      }
      return {
        exists: false,
        title: link.label,
        subtitle: 'Project-only reference not available in public help',
      };
    };
  }, [articleAnchors, helpRefs]);

  useEffect(() => {
    if (!article) return;
    const hash = window.location.hash.replace(/^#/, '').trim();
    if (!hash) return;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(hash);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [article?.id]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <a
            href="/help"
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Help
          </a>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 hover:border-blue-500/40 hover:text-white transition-colors"
          >
            <Home className="h-4 w-4" />
            Dashboard
          </a>
        </div>

        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/50 p-6 backdrop-blur-sm">
          {loading ? (
            <div className="text-slate-300">Loading article...</div>
          ) : missing || !article ? (
            <div className="text-slate-300">This article was not found.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-blue-200">
                <FileText className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wide">Documentation</span>
              </div>
              <h1 className="text-2xl font-semibold text-white">{article.title}</h1>
              {article.summary && <p className="text-slate-300">{article.summary}</p>}
              <div className="text-xs text-slate-400">
                Updated {new Date(article.updated_at).toLocaleString()}
              </div>
              <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
                <LinkedContent
                  content={article.content || 'No content yet.'}
                  resolveMeta={resolveMeta}
                  resolveHelpHref={resolveHelpHref}
                  className="space-y-4 text-sm leading-6 text-slate-100 font-sans"
                  onActivateHelpTeleport={(anchorId) => {
                    const target = document.getElementById(anchorId);
                    if (!target) return;
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    window.history.replaceState(null, '', `#${anchorId}`);
                  }}
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
