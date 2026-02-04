import { useState, useEffect } from 'react';
import { Link2, Copy, ExternalLink, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../hooks/useOrg';

interface ShortUrl {
  id: string;
  short_code: string;
  target_url: string;
  clicks: number;
  created_at: string;
}

export function URLShortener() {
  const { organization } = useOrg();
  const [urls, setUrls] = useState<ShortUrl[]>([]);
  const [targetUrl, setTargetUrl] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [urlToDelete, setUrlToDelete] = useState<ShortUrl | null>(null);

  useEffect(() => {
    loadUrls();
  }, []);

  const loadUrls = async () => {
    const { data, error } = await supabase
      .from('short_urls')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) setUrls(data);
  };

  const generateShortCode = () => {
    return Math.random().toString(36).substring(2, 8);
  };

  const formatUrl = (url: string) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return 'https://' + url;
    }
    return url;
  };

  const getShortUrl = (shortCode: string) => {
    return `${window.location.origin}/${shortCode}`;
  };

  const createShortUrl = async () => {
    if (!targetUrl || !organization) return;

    const shortCode = (customCode || generateShortCode()).trim();

    const { error } = await supabase.from('short_urls').insert({
      short_code: shortCode,
      target_url: targetUrl.trim(),
      org_id: organization.id,
    });

    if (error) {
      // Keep behavior as-is (your project uses alert in a few tools already)
      if ((error as any).code === '23505') {
        alert('This short code is already taken. Try another one.');
      } else {
        alert('Failed to create short URL');
      }
      return;
    }

    setTargetUrl('');
    setCustomCode('');
    loadUrls();
  };

  const copyToClipboard = (shortCode: string) => {
    const shortUrl = getShortUrl(shortCode);
    navigator.clipboard.writeText(shortUrl);
    setCopied(shortCode);
    setTimeout(() => setCopied(null), 2000);
  };

  const confirmDelete = (url: ShortUrl) => {
    setUrlToDelete(url);
    setShowDeleteModal(true);
  };

  const deleteUrl = async () => {
    if (!urlToDelete) return;

    const { error } = await supabase
      .from('short_urls')
      .delete()
      .eq('id', urlToDelete.id);

    if (!error) {
      setShowDeleteModal(false);
      setUrlToDelete(null);
      loadUrls();
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Link2 className="w-5 h-5" />
          URL Shortener
        </h2>
      </div>

      <div className="mb-4 space-y-2 p-4 bg-slate-900/50 rounded-lg">
        <input
          type="url"
          placeholder="Enter long URL"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="Custom short code (optional)"
          value={customCode}
          onChange={(e) => setCustomCode(e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={createShortUrl}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
        >
          Shorten URL
        </button>
      </div>

      <div className="space-y-3">
        {urls.map((url) => (
          <div
            key={url.id}
            className="group relative bg-slate-900/50 hover:bg-slate-900/80 rounded-lg p-4 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {/* ✅ FIXED: restored <a> */}
                  <a
                    href={`/${url.short_code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 font-mono text-sm"
                    title="Open short URL"
                  >
                    {getShortUrl(url.short_code)}
                  </a>

                  <button
                    onClick={() => copyToClipboard(url.short_code)}
                    className="p-1 hover:bg-slate-700 rounded transition-colors"
                    title="Copy"
                  >
                    {copied === url.short_code ? (
                      <span className="text-green-400 text-xs">Copied!</span>
                    ) : (
                      <Copy className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </div>

                <p className="text-slate-400 text-sm truncate">{url.target_url}</p>
                <p className="text-slate-500 text-xs mt-1">{url.clicks} clicks</p>
              </div>

              <div className="flex gap-2">
                {/* ✅ FIXED: restored <a> */}
                <a
                  href={formatUrl(url.target_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  title="Open destination"
                >
                  <ExternalLink className="w-4 h-4 text-white" />
                </a>

                <button
                  onClick={() => confirmDelete(url)}
                  className="p-2 bg-red-600 hover:bg-red-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {urls.length === 0 && (
        <p className="text-slate-400 text-center py-8">
          No shortened URLs yet. Create one to get started!
        </p>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && urlToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">⚠️</div>
              <h3 className="text-xl font-semibold text-white mb-2">Delete Short URL?</h3>
              <p className="text-slate-400">
                Are you sure you want to delete the short URL "{urlToDelete.short_code}"? This action cannot be undone
                and the link will stop working.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setUrlToDelete(null);
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteUrl}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
