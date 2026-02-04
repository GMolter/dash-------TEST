import { useEffect, useState } from 'react';
import { FileText, Copy, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  pasteCode: string;
}

export function PasteView({ pasteCode }: Props) {
  const [paste, setPaste] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadPaste = async () => {
      const { data, error } = await supabase
        .from('pastes')
        .select('*')
        .eq('paste_code', pasteCode)
        .maybeSingle();

      if (error || !data) {
        setError('Paste not found');
        setLoading(false);
        return;
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setError('This paste has expired');
        setLoading(false);
        return;
      }

      setPaste(data);
      setLoading(false);

      await supabase
        .from('pastes')
        .update({ views: data.views + 1 })
        .eq('paste_code', pasteCode);
    };

    loadPaste();
  }, [pasteCode]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(paste.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading paste...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-800 rounded-lg p-8 text-center border border-slate-700">
          <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Paste Not Found</h1>
          <p className="text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-blue-500" />
              <h1 className="text-2xl font-bold text-white">{paste.title}</h1>
            </div>
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span className="px-2 py-1 bg-slate-700 rounded">{paste.language}</span>
            <span>{paste.views} views</span>
            {paste.expires_at && (
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Expires {new Date(paste.expires_at).toLocaleString()}
              </span>
            )}
            <span>Created {new Date(paste.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <pre className="p-6 overflow-x-auto">
            <code className="text-slate-200 font-mono text-sm">{paste.content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
