import { useState, useEffect } from 'react';
import { Link2, Plus, X, ExternalLink, MoreVertical } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Resource = {
  id: string;
  project_id: string;
  title: string;
  url: string;
  description: string;
  category: 'documentation' | 'design' | 'reference' | 'tool' | 'code' | 'other';
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
  other: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
};

export function ResourcesView({ projectId }: { projectId: string }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  async function loadResources() {
    const { data, error } = await supabase
      .from('project_resources')
      .select('*')
      .eq('project_id', projectId)
      .order('position', { ascending: true });

    if (error) {
      console.error('Error loading resources:', error);
      return;
    }

    setResources((data as Resource[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    loadResources();
  }, [projectId]);

  const filteredResources =
    filterCategory === 'all'
      ? resources
      : resources.filter((r) => r.category === filterCategory);

  async function deleteResource(id: string) {
    await supabase.from('project_resources').delete().eq('id', id);
    setResources((prev) => prev.filter((r) => r.id !== id));
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
          {['all', 'documentation', 'design', 'reference', 'tool', 'code', 'other'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-full border text-sm capitalize transition-colors ${
                filterCategory === cat
                  ? 'bg-blue-500/20 border-blue-500/30 text-blue-200'
                  : 'bg-slate-900/30 border-slate-800/60 text-slate-400 hover:bg-slate-900/50'
              }`}
            >
              {cat}
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
    </>
  );
}

function ResourceCard({
  resource,
  onDelete,
}: {
  resource: Resource;
  onDelete: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="group rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 hover:border-slate-700/70 transition-colors">
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
              {resource.title}
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
            {resource.category}
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
    if (!url.trim() || !title.trim()) return;

    setLoading(true);

    const { data, error } = await supabase
      .from('project_resources')
      .insert({
        project_id: projectId,
        url: url.trim(),
        title: title.trim(),
        description: description.trim(),
        category,
        position: Date.now(),
      })
      .select('*')
      .single();

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
              disabled={!url.trim() || !title.trim() || loading}
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
