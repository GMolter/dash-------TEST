import { useState, useEffect } from 'react';
import { FileText, Clock, Eye, ArrowLeft, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Paste {
  id: string;
  paste_code: string;
  title: string;
  content: string;
  language: string;
  expires_at?: string;
  views: number;
  created_at: string;
}

export function PasteList() {
  const [pastes, setPastes] = useState<Paste[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCount, setShowCount] = useState(5);

  useEffect(() => {
    loadPastes();
  }, [showCount]);

  const loadPastes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pastes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(showCount);

    if (!error && data) {
      setPastes(data);
    }
    setLoading(false);
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const truncateContent = (content: string, maxLength: number = 200) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </a>
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-8 h-8 text-blue-500" />
            <h1 className="text-4xl font-bold text-white">Public Pastes</h1>
          </div>
          <p className="text-slate-400">Browse recently shared code and text snippets</p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-slate-400">Loading pastes...</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {pastes.map((paste) => (
                <a
                  key={paste.id}
                  href={`/p/${paste.paste_code}`}
                  className={`block bg-slate-800/50 backdrop-blur-sm hover:bg-slate-800/80 rounded-lg p-6 border border-slate-700 transition-all hover:border-slate-600 ${
                    isExpired(paste.expires_at) ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <h2 className="text-xl font-semibold text-white">{paste.title}</h2>
                        <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                          {paste.language}
                        </span>
                        {isExpired(paste.expires_at) && (
                          <span className="px-2 py-1 bg-red-900/50 border border-red-700 rounded text-xs text-red-400">
                            Expired
                          </span>
                        )}
                      </div>

                      <pre className="mb-3 p-3 bg-slate-900/50 rounded text-sm text-slate-300 overflow-x-auto border border-slate-700">
                        <code>{truncateContent(paste.content)}</code>
                      </pre>

                      <div className="flex items-center gap-4 text-sm text-slate-400">
                        <span className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          {paste.views} views
                        </span>
                        {paste.expires_at && !isExpired(paste.expires_at) && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            Expires {new Date(paste.expires_at).toLocaleDateString()}
                          </span>
                        )}
                        <span>
                          Created {new Date(paste.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <ExternalLink className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  </div>
                </a>
              ))}
            </div>

            {pastes.length === 0 && (
              <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700">
                <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No pastes found. Be the first to share!</p>
              </div>
            )}

            {pastes.length >= showCount && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => setShowCount(showCount + 10)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
                >
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
