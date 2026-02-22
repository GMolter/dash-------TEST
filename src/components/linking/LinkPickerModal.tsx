import { useEffect, useMemo, useState } from 'react';
import { Link2, FolderOpen, CalendarDays, Columns3, BookOpenText, X, Search } from 'lucide-react';
import type { LinkTarget } from '../../lib/linking';
import { createMarkdownLink, normalizeExternalUrl } from '../../lib/linking';
import type { LinkPickerOption, LinkPickerTab } from './types';

type LinkPickerModalProps = {
  open: boolean;
  allowedTabs: LinkPickerTab[];
  options: LinkPickerOption[];
  initialLabel: string;
  initialTarget?: LinkTarget | null;
  onClose: () => void;
  onSubmit: (payload: { label: string; target: LinkTarget; token: string }) => void;
};

function tabIcon(tab: LinkPickerTab) {
  if (tab === 'external') return <Link2 className="h-4 w-4" />;
  if (tab === 'file') return <FolderOpen className="h-4 w-4" />;
  if (tab === 'resource') return <Link2 className="h-4 w-4" />;
  if (tab === 'planner') return <CalendarDays className="h-4 w-4" />;
  if (tab === 'board') return <Columns3 className="h-4 w-4" />;
  return <BookOpenText className="h-4 w-4" />;
}

function tabLabel(tab: LinkPickerTab) {
  if (tab === 'external') return 'External';
  if (tab === 'file') return 'Files';
  if (tab === 'resource') return 'Resources';
  if (tab === 'planner') return 'Planner';
  if (tab === 'board') return 'Board';
  return 'Help Articles';
}

function isTargetForTab(target: LinkTarget, tab: LinkPickerTab) {
  if (tab === 'external') return target.type === 'external';
  if (tab === 'help') return target.type === 'help';
  if (tab === 'file') return target.type === 'project_file';
  if (tab === 'resource') return target.type === 'project_resource';
  if (tab === 'planner') return target.type === 'project_planner';
  return target.type === 'project_board';
}

function targetsEqual(a: LinkTarget, b: LinkTarget) {
  if (a.type !== b.type) return false;
  if (a.type === 'external') return b.type === 'external' && a.url === b.url;
  if (a.type === 'help') return b.type === 'help' && a.articleId === b.articleId;
  return (
    b.type !== 'external' &&
    b.type !== 'help' &&
    a.projectId === b.projectId &&
    a.targetId === b.targetId
  );
}

export function LinkPickerModal({
  open,
  allowedTabs,
  options,
  initialLabel,
  initialTarget,
  onClose,
  onSubmit,
}: LinkPickerModalProps) {
  const [activeTab, setActiveTab] = useState<LinkPickerTab>(allowedTabs[0] || 'external');
  const [displayText, setDisplayText] = useState(initialLabel);
  const [query, setQuery] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setDisplayText(initialLabel);
    setQuery('');
    setExternalUrl('');

    const defaultTab = initialTarget
      ? allowedTabs.find((tab) => isTargetForTab(initialTarget, tab)) || allowedTabs[0] || 'external'
      : allowedTabs[0] || 'external';
    setActiveTab(defaultTab);

    if (initialTarget && defaultTab !== 'external') {
      const matched = options.find((item) => targetsEqual(item.target, initialTarget));
      setSelectedOptionId(matched?.id || '');
    } else {
      setSelectedOptionId('');
    }

    if (initialTarget?.type === 'external') {
      setExternalUrl(initialTarget.url || '');
    }
  }, [open, allowedTabs, options, initialLabel, initialTarget]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const filteredOptions = useMemo(() => {
    const list = options.filter((item) => item.tab === activeTab);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) => `${item.title} ${item.subtitle || ''} ${item.badge || ''}`.toLowerCase().includes(q));
  }, [options, activeTab, query]);

  const selectedOption = filteredOptions.find((item) => item.id === selectedOptionId) || null;

  if (!open) return null;

  const canSubmit = (() => {
    if (!displayText.trim()) return false;
    if (activeTab === 'external') return !!externalUrl.trim();
    return !!selectedOption;
  })();

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6">
      <button className="absolute inset-0 bg-black/65" onClick={onClose} aria-label="Close" />
      <div className="relative w-[780px] max-w-[96vw] rounded-3xl border border-slate-700/70 bg-slate-950/95 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-100">Insert Link</div>
            <div className="text-sm text-slate-300">Attach external or internal references to selected text.</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-2 text-slate-300 hover:bg-slate-900/60"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <label className="mb-1 block text-sm text-slate-300">Display Text</label>
            <input
              value={displayText}
              onChange={(e) => setDisplayText(e.target.value)}
              placeholder="Text shown in document"
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end">
            {allowedTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  activeTab === tab
                    ? 'border-blue-400/45 bg-blue-500/15 text-blue-100'
                    : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:bg-slate-900/60'
                }`}
              >
                {tabIcon(tab)}
                <span>{tabLabel(tab)}</span>
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'external' ? (
          <div className="mt-4">
            <label className="mb-1 block text-sm text-slate-300">URL</label>
            <input
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-900/35 p-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${tabLabel(activeTab).toLowerCase()}...`}
                className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
              />
            </div>
            <div className="mt-3 max-h-[300px] space-y-1 overflow-auto pr-1">
              {filteredOptions.length === 0 ? (
                <div className="rounded-lg border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-sm text-slate-400">
                  No matches found.
                </div>
              ) : (
                filteredOptions.map((item) => {
                  const selected = selectedOptionId === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedOptionId(item.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                        selected
                          ? 'border-blue-500/40 bg-blue-500/12'
                          : 'border-slate-800/70 bg-slate-950/60 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-100">{item.title}</div>
                          {item.subtitle ? <div className="truncate text-xs text-slate-400">{item.subtitle}</div> : null}
                        </div>
                        {item.badge ? (
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                            item.badge.toLowerCase() === 'draft'
                              ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                              : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                          }`}>
                            {item.badge}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {selectedOption?.warning ? (
              <div className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {selectedOption.warning}
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-900/45 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/65"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              const cleanLabel = displayText.trim();
              const target: LinkTarget =
                activeTab === 'external'
                  ? { type: 'external', url: normalizeExternalUrl(externalUrl) }
                  : (selectedOption as LinkPickerOption).target;
              onSubmit({
                label: cleanLabel,
                target,
                token: createMarkdownLink(cleanLabel, target),
              });
            }}
            className={`rounded-xl border px-3 py-2 text-sm ${
              canSubmit
                ? 'border-blue-500/35 bg-blue-500/15 text-blue-100 hover:bg-blue-500/25'
                : 'cursor-not-allowed border-slate-700 bg-slate-900/30 text-slate-500'
            }`}
          >
            Insert Link
          </button>
        </div>
      </div>
    </div>
  );
}
