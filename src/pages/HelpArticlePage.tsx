import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Home } from 'lucide-react';

type Article = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  updated_at: string;
};

export function HelpArticlePage({ slug }: { slug: string }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const r = await fetch(`/api/public/help-article?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
        if (r.status === 404) {
          if (!cancelled) setMissing(true);
          return;
        }
        const j = await r.json();
        if (!cancelled) setArticle(j.article || null);
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
                <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-100 font-sans">
                  {article.content || 'No content yet.'}
                </pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
