import { useEffect, useState } from 'react';
import { MessageCircleQuestion, FileText, BookOpenText } from 'lucide-react';

export function HelpPage() {
  const [docs, setDocs] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const r = await fetch('/api/public/settings');
        const j = await r.json();
        if (!cancelled) setDocs(j.helpDocs || '');
      } catch {
        if (!cancelled) setDocs('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <header className="mb-8 rounded-2xl border border-slate-700/70 bg-slate-900/50 p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-500/10">
              <BookOpenText className="h-5 w-5 text-blue-200" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Help Center</h1>
              <p className="text-sm text-slate-300">
                Find answers, guides, and platform documentation.
              </p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-slate-700/70 bg-slate-900/50 p-5 backdrop-blur-sm">
            <div className="mb-2 flex items-center gap-2 text-white">
              <MessageCircleQuestion className="h-5 w-5 text-blue-300" />
              <h2 className="text-lg font-semibold">Q&A</h2>
            </div>
            <p className="text-sm text-slate-400">
              Common questions and quick answers are coming soon.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-700/70 bg-slate-900/50 p-5 backdrop-blur-sm lg:col-span-2">
            <div className="mb-2 flex items-center gap-2 text-white">
              <FileText className="h-5 w-5 text-blue-300" />
              <h2 className="text-lg font-semibold">Docs</h2>
            </div>

            {loading ? (
              <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
                Loading documentation...
              </div>
            ) : docs.trim() ? (
              <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
                <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-100 font-sans">
                  {docs}
                </pre>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
                Documentation has not been published yet.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
