import { useState, useEffect } from 'react';
import { Plus, Folder, Trash2, Tag, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../hooks/useOrg';

interface Project {
  id: string;
  name: string;
  description: string;
  url?: string;
  status: string;
  tags: string[];
  created_at: string;
}

export function ProjectsCenter() {
  const { organization } = useOrg();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('active');
  const [tags, setTags] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setProjects(data);
    }
  };

  const addProject = async () => {
    if (!name || !organization) return;

    const { error } = await supabase.from('projects').insert({
      name,
      description,
      url: url || null,
      status,
      org_id: organization.id,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });

    if (!error) {
      resetForm();
      loadProjects();
    }
  };

  const updateProject = async () => {
    if (!editingProject || !name) return;

    const { error } = await supabase
      .from('projects')
      .update({
        name,
        description,
        url: url || null,
        status,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      .eq('id', editingProject.id);

    if (!error) {
      resetForm();
      loadProjects();
    }
  };

  const deleteProject = async () => {
    if (!projectToDelete) return;

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectToDelete.id);

    if (!error) {
      setShowDeleteModal(false);
      setProjectToDelete(null);
      loadProjects();
    }
  };

  const confirmDelete = (project: Project) => {
    setProjectToDelete(project);
    setShowDeleteModal(true);
  };

  const startEdit = (project: Project) => {
    setEditingProject(project);
    setName(project.name);
    setDescription(project.description);
    setUrl(project.url || '');
    setStatus(project.status);
    setTags(project.tags.join(', '));
    setShowForm(true);
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setUrl('');
    setStatus('active');
    setTags('');
    setShowForm(false);
    setEditingProject(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-600';
      case 'completed':
        return 'bg-blue-600';
      case 'archived':
        return 'bg-slate-600';
      default:
        return 'bg-slate-600';
    }
  };

  const formatUrl = (url: string) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return 'https://' + url;
    }
    return url;
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Folder className="w-5 h-5" />
          Projects Center
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Project
        </button>
      </div>

      {showForm && (
        <div className="mb-4 space-y-2 p-4 bg-slate-900/50 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-3">
            {editingProject ? 'Edit Project' : 'Add New Project'}
          </h3>
          <input
            type="text"
            placeholder="Project Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
          />
          <input
            type="url"
            placeholder="URL (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Tags (comma separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={editingProject ? updateProject : addProject}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
            >
              {editingProject ? 'Update Project' : 'Add Project'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {projects.map((project) => (
          <div
            key={project.id}
            className="group relative bg-slate-900/50 hover:bg-slate-900/80 rounded-lg p-4 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-white font-medium">{project.name}</h3>
                  <span className={`px-2 py-0.5 ${getStatusColor(project.status)} rounded text-xs text-white`}>
                    {project.status}
                  </span>
                </div>

                {project.description && <p className="text-slate-400 text-sm mb-2">{project.description}</p>}

                {/* ✅ FIXED: missing <a> tag */}
                {project.url && (
                  <a
                    href={formatUrl(project.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    {project.url}
                  </a>
                )}

                {project.tags.length > 0 && (
                  <div className="flex items-center gap-1 mt-2">
                    <Tag className="w-3 h-3 text-slate-500" />
                    {project.tags.map((tag, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEdit(project)}
                  className="p-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                >
                  <Pencil className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={() => confirmDelete(project)}
                  className="p-2 bg-red-600 hover:bg-red-700 rounded transition-opacity"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {projects.length === 0 && !showForm && (
        <p className="text-slate-400 text-center py-8">No projects yet. Add one to get started!</p>
      )}

      {showDeleteModal && projectToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">⚠️</div>
              <h3 className="text-xl font-semibold text-white mb-2">Delete Project?</h3>
              <p className="text-slate-400">
                Are you sure you want to delete "{projectToDelete.name}"? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setProjectToDelete(null);
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteProject}
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
