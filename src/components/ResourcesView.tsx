import { useState, useEffect } from 'react';
import { Link2, Plus, X, ExternalLink, MoreVertical } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Resource = {
  id: string;
  project_id: string;
  title: string;
  url: string;
  description: string;
  category: 'documentation' | 'design' | 'reference' | 'tool' | 'code' | 'other' | 'quick_links';
  position: number;
  favicon_url: string | null;
  created_at: string;
  updated_at: string;
};

const categoryColors = {
  documentation: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  design: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
  reference: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  tool: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  code: 'bg-pink-500/15 text-pink-300 border-pink-500/25',
  quick_links: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  other: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
};

function formatCategoryLabel(cat: Resource['category']) {
  if (cat === 'quick_links') return 'Quick Links';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

export function ResourcesView({
  projectId,
  highlightResourceId,
  onHighlightConsumed,
}: {
  projectId: string;
  highlightResourceId?: string | null;
  onHighlightConsumed?: () => void;
}) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [editingResource, setEditingResource] = useState<Resource | null>(null);

  async function loadResources() {
    const { data, error } = await supabase
      .from('project_resources')
      .select('*')
      .eq('project_id', projectId)
      .order('position', { ascending: true });

    if (error) {
      console.error('Error loading resources:', error);
      setLoading(false);
      return;
    }

    setResources((data as Resource[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    loadResources();
  }, [projectId]);

  useEffect(() => {
    if (!highlightResourceId) return;
    setFilterCategory('all');

    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(`resource-${highlightResourceId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);

    const clearTimer = window.setTimeout(() => {
      onHighlightConsumed?.();
    }, 2800);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightResourceId, onHighlightConsumed, resources.length]);

  const filteredResources =
    filterCategory === 'all'
      ? resources
      : resources.filter((r) => r.category === filterCategory);

  async function deleteResource(id: string) {
    await supabase.from('project_resources').delete().eq('id', id);
    setResources((prev) => prev.filter((r) => r.id !== id));
  }

  async function updateResource(resource: Resource) {
    const { data, error } = await supabase
      .from('project_resources')
      .update({
        title: resource.title,
        url: resource.url,
        description: resource.description,
        category: resource.category,
        updated_at: new Date().toISOString(),
      })
      .eq('id', resource.id)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating resource:', error);
      return false;
    }

    if (data) {
      const updated = data as Resource;
      setResources((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
    return true;
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6 min-h-[520px] flex items-center justify-center">
        <div className="text-slate-400">Loading resources...</div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6 min-h-[520px]">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="text-2xl font-semibold">Resources</div>
            <div className="text-slate-300">{resources.length} external links</div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Resource</span>
          </button>
        </div>

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {['all', 'documentation', 'design', 'reference', 'tool', 'code', 'quick_links', 'other'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                filterCategory === cat
                  ? 'bg-blue-500/20 border-blue-500/30 text-blue-200'
                  : 'bg-slate-900/30 border-slate-800/60 text-slate-400 hover:bg-slate-900/50'
              }`}
            >
              {cat === 'all' ? 'All' : formatCategoryLabel(cat as Resource['category'])}
            </button>
          ))}
        </div>

        {filteredResources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-slate-900/50 border border-slate-800/60 flex items-center justify-center mb-4">
              <Link2 className="w-8 h-8 text-slate-400" />
            </div>
            <div className="text-slate-300 font-medium mb-2">No resources yet</div>
            <div className="text-slate-400 text-sm text-center max-w-sm mb-6">
              Add external links to documentation, design files, tools, and more
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Resource
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredResources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                onDelete={deleteResource}
                onEdit={() => setEditingResource(resource)}
                highlighted={resource.id === highlightResourceId}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <AddResourceModal
          projectId={projectId}
          onClose={() => setShowModal(false)}
          onAdd={(resource) => {
            setResources((prev) => [...prev, resource]);
            setShowModal(false);
          }}
        />
      )}

      {editingResource && (
        <EditResourceModal
          resource={editingResource}
          onClose={() => setEditingResource(null)}
          onSave={async (updated) => {
            const ok = await updateResource(updated);
            if (ok) setEditingResource(null);
          }}
        />
      )}
    </>
  );
}

function ResourceCard({
  resource,
  onDelete,
  onEdit,
  highlighted,
}: {
  resource: Resource;
  onDelete: (id: string) => void;
  onEdit: () => void;
  highlighted: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const displayTitle = resource.title?.trim() || resource.url;

  return (
    <div
      id={`resource-${resource.id}`}
      className={`group rounded-2xl border bg-slate-950/60 p-4 transition-colors ${
        highlighted
          ? 'border-cyan-400/60 ring-2 ring-cyan-400/35'
          : 'border-slate-800/60 hover:border-slate-700/70'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-900/50 border border-slate-800/60 flex items-center justify-center">
          <Link2 className="w-5 h-5 text-slate-400" />
        </div>

        <div className="flex-1 min-w-0">
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group/link flex items-center gap-1.5 mb-1"
          >
            <span className="text-sm font-medium text-slate-100 group-hover/link:text-blue-300 truncate">
              {displayTitle}
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover/link:text-blue-400 flex-shrink-0" />
          </a>

          {resource.description && (
            <p className="text-xs text-slate-400 line-clamp-2 mb-2">{resource.description}</p>
          )}

          <span
            className={`inline-block px-2 py-0.5 rounded-full border text-xs capitalize ${
              categoryColors[resource.category]
            }`}
          >
            {formatCategoryLabel(resource.category)}
          </span>
        </div>

        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-slate-800/50 text-slate-400 transition-opacity"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-8 z-20 w-32 rounded-2xl border border-slate-800/60 bg-slate-950/95 backdrop-blur shadow-xl overflow-hidden">
                <button
                  onClick={() => {
                    onEdit();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-900/50"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this resource?')) {
                      onDelete(resource.id);
                    }
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-slate-900/50"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AddResourceModal({
  projectId,
  onClose,
  onAdd,
}: {
  projectId: string;
  onClose: () => void;
  onAdd: (resource: Resource) => void;
}) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Resource['category']>('other');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!url.trim()) return;
    if (category !== 'quick_links' && !title.trim()) return;

    setLoading(true);
    let nextPosition = 10;
    try {
      const { data: posData, error: posError } = await supabase
        .from('project_resources')
        .select('position')
        .eq('project_id', projectId)
        .order('position', { ascending: false })
        .limit(1);
      if (posError) throw posError;
      nextPosition = (((posData as { position: number }[]) || [])[0]?.position || 0) + 10;
    } catch (e) {
      console.error('Error calculating resource position:', e);
      setLoading(false);
      return;
    }

    let { data, error } = await supabase
      .from('project_resources')
      .insert({
        project_id: projectId,
        url: url.trim(),
        title: title.trim(),
        description: description.trim(),
        category,
        position: nextPosition,
      })
      .select('*')
      .single();

    if (error && category === 'quick_links') {
      const msg = (error as { message?: string }).message || '';
      const code = (error as { code?: string }).code || '';
      const missingQuickLinksCategory =
        code === '23514' ||
        msg.includes('project_resources_category_check') ||
        msg.toLowerCase().includes('check constraint');

      if (missingQuickLinksCategory) {
        const retry = await supabase
          .from('project_resources')
          .insert({
            project_id: projectId,
            url: url.trim(),
            title: title.trim(),
            description: description.trim(),
            category: 'other',
            position: nextPosition,
          })
          .select('*')
          .single();
        data = retry.data;
        error = retry.error as typeof error;
      }
    }

    setLoading(false);

    if (error) {
      console.error('Error adding resource:', error);
      return;
    }

    if (data) {
      onAdd(data as Resource);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800/60 bg-slate-950/95 backdrop-blur shadow-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="text-xl font-semibold">Add Resource</div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800/50 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resource name"
              className="w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
              className="w-full h-20 rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Resource['category'])}
              className="w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
            >
              <option value="documentation">Documentation</option>
              <option value="design">Design</option>
              <option value="reference">Reference</option>
              <option value="tool">Tool</option>
              <option value="code">Code</option>
              <option value="quick_links">Quick Links</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45 text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!url.trim() || (category !== 'quick_links' && !title.trim()) || loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white transition-colors"
            >
              {loading ? 'Adding...' : 'Add Resource'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditResourceModal({
  resource,
  onClose,
  onSave,
}: {
  resource: Resource;
  onClose: () => void;
  onSave: (resource: Resource) => Promise<boolean | void>;
}) {
  const [url, setUrl] = useState(resource.url);
  const [title, setTitle] = useState(resource.title || '');
  const [description, setDescription] = useState(resource.description || '');
  const [category, setCategory] = useState<Resource['category']>(resource.category);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!url.trim()) {
      setError('URL is required.');
      return;
    }
    if (category !== 'quick_links' && !title.trim()) {
      setError('Title is required when category is not Quick Links.');
      return;
    }

    setLoading(true);
    setError('');
    const result = await onSave({
      ...resource,
      url: url.trim(),
      title: title.trim(),
      description: description.trim(),
      category,
      updated_at: new Date().toISOString(),
    });
    if (result === false) {
      setError('Failed to save resource. Please try again.');
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800/60 bg-slate-950/95 backdrop-blur shadow-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="text-xl font-semibold">Edit Resource</div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800/50 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resource title"
              className="w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
              className="w-full h-20 rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Resource['category'])}
              className="w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
            >
              <option value="documentation">Documentation</option>
              <option value="design">Design</option>
              <option value="reference">Reference</option>
              <option value="tool">Tool</option>
              <option value="code">Code</option>
              <option value="quick_links">Quick Links</option>
              <option value="other">Other</option>
            </select>
          </div>

          {error && (
            <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45 text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white transition-colors"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
