import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Home } from 'lucide-react';
import { LinkedContent } from '../components/linking/renderLinkedContent';
import type { LinkResolvedMeta } from '../components/linking/types';
import type { ParsedMarkdownLink } from '../lib/linking';

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

  const resolveMeta = useMemo(() => {
    const byId = new Map(helpRefs.map((item) => [item.id, item]));
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
      return {
        exists: false,
        title: link.label,
        subtitle: 'Project-only reference not available in public help',
      };
    };
  }, [helpRefs]);

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
                  className="whitespace-pre-wrap text-sm leading-6 text-slate-100 font-sans"
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
