import { useState, useEffect } from 'react';
import { Plus, Zap, Trash2, Play, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../hooks/useOrg';

interface Trigger {
  id: string;
  name: string;
  webhook_url: string;
  method: string;
  description: string;
  last_triggered_at?: string;
}

export function Triggers() {
  const { organization } = useOrg();
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [triggerToDelete, setTriggerToDelete] = useState<Trigger | null>(null);
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null);
  
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [method, setMethod] = useState('POST');
  const [description, setDescription] = useState('');
  const [triggering, setTriggering] = useState<string | null>(null);

  useEffect(() => {
    loadTriggers();
  }, []);

  const loadTriggers = async () => {
    const { data, error } = await supabase
      .from('triggers')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTriggers(data);
    }
  };

  const addTrigger = async () => {
    if (!name || !webhookUrl || !organization) return;

    const { error } = await supabase.from('triggers').insert({
      name,
      webhook_url: webhookUrl,
      method,
      description,
      org_id: organization.id,
    });

    if (!error) {
      resetForm();
      loadTriggers();
    }
  };

  const updateTrigger = async () => {
    if (!editingTrigger || !name || !webhookUrl) return;

    const { error } = await supabase
      .from('triggers')
      .update({
        name,
        webhook_url: webhookUrl,
        method,
        description,
      })
      .eq('id', editingTrigger.id);

    if (!error) {
      resetForm();
      loadTriggers();
    }
  };

  const deleteTrigger = async () => {
    if (!triggerToDelete) return;

    const { error } = await supabase
      .from('triggers')
      .delete()
      .eq('id', triggerToDelete.id);

    if (!error) {
      setShowDeleteModal(false);
      setTriggerToDelete(null);
      loadTriggers();
    }
  };

  const confirmDelete = (trigger: Trigger) => {
    setTriggerToDelete(trigger);
    setShowDeleteModal(true);
  };

  const startEdit = (trigger: Trigger) => {
    setEditingTrigger(trigger);
    setName(trigger.name);
    setWebhookUrl(trigger.webhook_url);
    setMethod(trigger.method);
    setDescription(trigger.description);
    setShowForm(true);
  };

  const resetForm = () => {
    setName('');
    setWebhookUrl('');
    setMethod('POST');
    setDescription('');
    setShowForm(false);
    setEditingTrigger(null);
  };

  const executeTrigger = async (trigger: Trigger) => {
    setTriggering(trigger.id);

    try {
      const response = await fetch(trigger.webhook_url, {
        method: trigger.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: trigger.method !== 'GET' ? JSON.stringify({ triggered_at: new Date().toISOString() }) : undefined,
      });

      if (response.ok) {
        await supabase
          .from('triggers')
          .update({ last_triggered_at: new Date().toISOString() })
          .eq('id', trigger.id);

        loadTriggers();
        alert('Trigger executed successfully!');
      } else {
        alert('Trigger failed with status: ' + response.status);
      }
    } catch (error) {
      alert('Failed to execute trigger: ' + (error as Error).message);
    } finally {
      setTriggering(null);
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Triggers
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Trigger
        </button>
      </div>

      {showForm && (
        <div className="mb-4 space-y-2 p-4 bg-slate-900/50 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-3">
            {editingTrigger ? 'Edit Trigger' : 'Add New Trigger'}
          </h3>
          <input
            type="text"
            placeholder="Trigger Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="url"
            placeholder="Webhook URL"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={editingTrigger ? updateTrigger : addTrigger}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
            >
              {editingTrigger ? 'Update Trigger' : 'Add Trigger'}
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
        {triggers.map((trigger) => (
          <div
            key={trigger.id}
            className="group relative bg-slate-900/50 hover:bg-slate-900/80 rounded-lg p-4 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h3 className="text-white font-medium mb-1">{trigger.name}</h3>
                <p className="text-slate-400 text-sm mb-1">
                  {trigger.method} {trigger.webhook_url}
                </p>
                {trigger.description && <p className="text-slate-500 text-xs mb-2">{trigger.description}</p>}
                {trigger.last_triggered_at && (
                  <p className="text-slate-500 text-xs">
                    Last triggered: {new Date(trigger.last_triggered_at).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => executeTrigger(trigger)}
                  disabled={triggering === trigger.id}
                  className="p-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 rounded-lg transition-colors"
                >
                  <Play className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={() => startEdit(trigger)}
                  className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pencil className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={() => confirmDelete(trigger)}
                  className="p-2 bg-red-600 hover:bg-red-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {triggers.length === 0 && !showForm && (
        <p className="text-slate-400 text-center py-8">No triggers yet. Add one to get started!</p>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && triggerToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">⚠️</div>
              <h3 className="text-xl font-semibold text-white mb-2">Delete Trigger?</h3>
              <p className="text-slate-400">
                Are you sure you want to delete "{triggerToDelete.name}"? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setTriggerToDelete(null);
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteTrigger}
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
