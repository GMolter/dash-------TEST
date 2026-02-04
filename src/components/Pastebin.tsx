import { useState, useEffect } from 'react';
import { FileText, Copy, ExternalLink, Trash2, Clock, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../hooks/useOrg';
import { useAuth } from '../hooks/useAuth';

interface Paste {
  id: string;
  paste_code: string;
  title: string;
  content: string;
  language: string;
  expires_at?: string;
  views: number;
  created_at: string;
  user_id?: string | null;
  org_id?: string | null;
  scope_personal?: boolean;
  scope_org?: boolean;
  scope_public?: boolean;
}

export function Pastebin() {
  const { organization } = useOrg();
  const { user } = useAuth();
  const [pastes, setPastes] = useState<Paste[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [expiryOption, setExpiryOption] = useState('never');
  const [copied, setCopied] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<'personal' | 'org' | 'public'>('org');
  const [scopePersonal, setScopePersonal] = useState(false);
  const [scopeOrg, setScopeOrg] = useState(true);
  const [scopePublic, setScopePublic] = useState(false);
  const hasScope = scopePersonal || scopeOrg || scopePublic;

  useEffect(() => {
    loadPastes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibility, organization?.id, user?.id]);

  useEffect(() => {
    if (!organization && scopeOrg) {
      setScopeOrg(false);
    }
  }, [organization, scopeOrg]);

  const loadPastes = async () => {
    if (!user) {
      setPastes([]);
      return;
    }
    let query = supabase
      .from('pastes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (visibility === 'personal') {
      query = query.eq('scope_personal', true).eq('user_id', user.id);
    } else if (visibility === 'org') {
      if (!organization) {
        setPastes([]);
        return;
      }
      query = query.eq('scope_org', true).eq('org_id', organization.id);
    } else {
      query = query.eq('scope_public', true).eq('user_id', user.id);
    }

    const { data, error } = await query;
    if (!error && data) setPastes(data as Paste[]);
  };

  const generatePasteCode = () => {
    return Math.random().toString(36).substring(2, 10);
  };

  const getExpiryDate = () => {
    if (expiryOption === 'never') return null;

    const date = new Date();
    switch (expiryOption) {
      case '1hour':
        date.setHours(date.getHours() + 1);
        break;
      case '1day':
        date.setDate(date.getDate() + 1);
        break;
      case '1week':
        date.setDate(date.getDate() + 7);
        break;
      case '1month':
        date.setMonth(date.getMonth() + 1);
        break;
    }
    return date.toISOString();
  };

  const createPaste = async () => {
    if (!content.trim() || !user) return;
    if (scopeOrg && !organization) return;
    if (!hasScope) return;

    const pasteCode = generatePasteCode();
    const expiresAt = getExpiryDate();

    const { error } = await supabase.from('pastes').insert({
      paste_code: pasteCode,
      title: title || 'Untitled',
      content: content,
      language: 'markdown',
      expires_at: expiresAt,
      user_id: user.id,
      org_id: scopeOrg ? organization?.id : null,
      scope_personal: scopePersonal,
      scope_org: scopeOrg,
      scope_public: scopePublic,
    });

    if (!error) {
      setTitle('');
      setContent('');
      setExpiryOption('never');
      setShowForm(false);
      loadPastes();
    }
  };

  const deletePaste = async (id: string) => {
    const { error } = await supabase.from('pastes').delete().eq('id', id);

    if (!error) {
      loadPastes();
    }
  };

  const copyToClipboard = (pasteCode: string) => {
    // Share route (keeps the path; App also supports legacy /paste/:code)
    const pasteUrl = `${window.location.origin}/p/${pasteCode}`;
    navigator.clipboard.writeText(pasteUrl);
    setCopied(pasteCode);
    setTimeout(() => setCopied(null), 2000);
  };

  const getPasteUrl = (pasteCode: string) => `/p/${pasteCode}`;

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Pastebin
        </h2>
        <div className="flex gap-2">
          <a
            href="/p"
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm font-medium transition-colors"
          >
            <Eye className="w-4 h-4" />
            View All
          </a>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium transition-colors"
          >
            {showForm ? 'Cancel' : 'New Paste'}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setVisibility('personal')}
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            visibility === 'personal'
              ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
              : 'bg-slate-700/40 border-slate-700 text-slate-300 hover:bg-slate-700/60'
          }`}
        >
          Personal
        </button>
        <button
          onClick={() => setVisibility('org')}
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            visibility === 'org'
              ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-200'
              : 'bg-slate-700/40 border-slate-700 text-slate-300 hover:bg-slate-700/60'
          }`}
        >
          Org
        </button>
        <button
          onClick={() => setVisibility('public')}
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            visibility === 'public'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
              : 'bg-slate-700/40 border-slate-700 text-slate-300 hover:bg-slate-700/60'
          }`}
        >
          Public
        </button>
        <div className="ml-auto text-xs text-slate-400 flex items-center">
          {visibility === 'personal' && 'Only you can view these pastes.'}
          {visibility === 'org' && 'Visible to your organization.'}
          {visibility === 'public' && 'Anyone with the link can view.'}
        </div>
      </div>

      {showForm && (
        <div className="mb-4 space-y-2 p-4 bg-slate-900/50 rounded-lg">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setScopePersonal((v) => !v)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                scopePersonal
                  ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
                  : 'bg-slate-700/40 border-slate-700 text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              Personal
            </button>
            <button
              onClick={() => {
                if (!organization) return;
                setScopeOrg((v) => !v);
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                scopeOrg
                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-200'
                  : organization
                    ? 'bg-slate-700/40 border-slate-700 text-slate-300 hover:bg-slate-700/60'
                    : 'bg-slate-800/60 border-slate-800 text-slate-500 cursor-not-allowed'
              }`}
              title={!organization ? 'Join an organization to use org scope' : undefined}
            >
              Org
            </button>
            <button
              onClick={() => setScopePublic((v) => !v)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                scopePublic
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                  : 'bg-slate-700/40 border-slate-700 text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              Public
            </button>
            <div className="ml-auto text-xs text-slate-400 flex items-center">
              {!hasScope && 'Select at least one audience.'}
              {hasScope && 'Choose one or more audiences.'}
            </div>
          </div>
          <input
            type="text"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            placeholder="Paste your content here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm"
            rows={8}
          />
          <div className="flex gap-2">
            <select
              value={expiryOption}
              onChange={(e) => setExpiryOption(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="never">Never expires</option>
              <option value="1hour">1 hour</option>
              <option value="1day">1 day</option>
              <option value="1week">1 week</option>
              <option value="1month">1 month</option>
            </select>
          </div>
          <button
            onClick={createPaste}
            disabled={!hasScope || !content.trim() || (scopeOrg && !organization)}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
          >
            Create Paste
          </button>
        </div>
      )}

      <div className="space-y-3">
        {pastes.map((paste) => (
          <div
            key={paste.id}
            className={`group bg-slate-900/50 hover:bg-slate-900/80 rounded-lg p-4 transition-colors ${
              isExpired(paste.expires_at) ? 'opacity-50' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-medium mb-1">{paste.title}</h3>
                <div className="flex items-center gap-2 mb-2">
                  <a
                    href={getPasteUrl(paste.paste_code)}
                    className="text-blue-400 hover:text-blue-300 font-mono text-sm"
                  >
                    {window.location.origin}{getPasteUrl(paste.paste_code)}
                  </a>
                  <button
                    onClick={() => copyToClipboard(paste.paste_code)}
                    className="p-1 hover:bg-slate-700 rounded transition-colors"
                  >
                    {copied === paste.paste_code ? (
                      <span className="text-green-400 text-xs">Copied!</span>
                    ) : (
                      <Copy className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="px-2 py-0.5 bg-slate-700 rounded">{paste.language}</span>
                  <span>{paste.views} views</span>
                  {paste.expires_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {isExpired(paste.expires_at)
                        ? 'Expired'
                        : `Expires ${new Date(paste.expires_at).toLocaleDateString()}`}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={getPasteUrl(paste.paste_code)}
                  className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-white" />
                </a>
                <button
                  onClick={() => deletePaste(paste.id)}
                  className="p-2 bg-red-600 hover:bg-red-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {pastes.length === 0 && !showForm && (
        <p className="text-slate-400 text-center py-8">No pastes yet. Create one to get started!</p>
      )}
    </div>
  );
}
