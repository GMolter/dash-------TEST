import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Sparkles, Archive, MoreVertical, GripVertical } from 'lucide-react';
import { supabase } from '../lib/supabase';

type PlannerStep = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  completed: boolean;
  position: number;
  archived: boolean;
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
};

export function PlannerView({ projectId }: { projectId: string }) {
  const [steps, setSteps] = useState<PlannerStep[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadSteps() {
    const { data, error } = await supabase
      .from('project_planner_steps')
      .select('*')
      .eq('project_id', projectId)
      .order('position', { ascending: true });

    if (error) {
      console.error('Error loading steps:', error);
      return;
    }

    setSteps((data as PlannerStep[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    loadSteps();
  }, [projectId]);

  const filteredSteps = showArchived
    ? steps
    : steps.filter((s) => !s.archived);

  const completedCount = steps.filter((s) => s.completed && !s.archived).length;
  const totalCount = steps.filter((s) => !s.archived).length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  async function toggleComplete(stepId: string, completed: boolean) {
    await supabase
      .from('project_planner_steps')
      .update({ completed, updated_at: new Date().toISOString() })
      .eq('id', stepId);

    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, completed } : s))
    );
  }

  async function updateStepTitle(stepId: string, title: string) {
    await supabase
      .from('project_planner_steps')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', stepId);
  }

  async function updateStepDescription(stepId: string, description: string) {
    await supabase
      .from('project_planner_steps')
      .update({ description, updated_at: new Date().toISOString() })
      .eq('id', stepId);
  }

  async function archiveStep(stepId: string) {
    await supabase
      .from('project_planner_steps')
      .update({ archived: true, updated_at: new Date().toISOString() })
      .eq('id', stepId);

    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, archived: true } : s)));
  }

  async function deleteStep(stepId: string) {
    await supabase.from('project_planner_steps').delete().eq('id', stepId);
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6 min-h-[520px] flex items-center justify-center">
        <div className="text-slate-400">Loading planner...</div>
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6 min-h-[520px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">Planner</div>
            <div className="text-slate-300">AI-powered project planning</div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6">
            <Sparkles className="w-8 h-8 text-blue-400" />
          </div>
          <div className="text-xl font-semibold text-slate-100 mb-2">
            Generate an AI-powered plan
          </div>
          <div className="text-slate-400 text-center max-w-md mb-8">
            The AI will analyze your project files and create a customized step-by-step plan
            tailored to your requirements.
          </div>
          <button className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">
            <Sparkles className="w-5 h-5" />
            <span>Analyze Files & Generate Plan</span>
          </button>
          <div className="mt-4 text-sm text-slate-500">
            AI will analyze all files in your project
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6 min-h-[520px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold">Planner</div>
          <div className="text-slate-300">
            {completedCount} of {totalCount} steps completed ({progressPercent}%)
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`px-3 py-2 rounded-2xl border text-sm transition-colors ${
              showArchived
                ? 'bg-slate-700/30 border-slate-700/50 text-slate-200'
                : 'bg-slate-900/30 border-slate-800/70 text-slate-400 hover:bg-slate-900/45'
            }`}
          >
            <Archive className="w-4 h-4 inline mr-1" />
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 text-sm transition-colors">
            <Sparkles className="w-4 h-4" />
            <span>Regenerate Plan</span>
          </button>
        </div>
      </div>

      <div className="mt-2 h-2 bg-slate-900/50 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mt-8 space-y-3">
        {filteredSteps.map((step, index) => (
          <StepCard
            key={step.id}
            step={step}
            index={index}
            onToggleComplete={toggleComplete}
            onUpdateTitle={updateStepTitle}
            onUpdateDescription={updateStepDescription}
            onArchive={archiveStep}
            onDelete={deleteStep}
          />
        ))}
      </div>
    </div>
  );
}

function StepCard({
  step,
  index,
  onToggleComplete,
  onUpdateTitle,
  onUpdateDescription,
  onArchive,
  onDelete,
}: {
  step: PlannerStep;
  index: number;
  onToggleComplete: (id: string, completed: boolean) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdateDescription: (id: string, description: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(step.title);
  const [descValue, setDescValue] = useState(step.description);
  const [showMenu, setShowMenu] = useState(false);

  const saveTitle = () => {
    if (titleValue.trim() && titleValue !== step.title) {
      onUpdateTitle(step.id, titleValue.trim());
    }
    setEditingTitle(false);
  };

  const saveDescription = () => {
    if (descValue !== step.description) {
      onUpdateDescription(step.id, descValue);
    }
  };

  return (
    <div
      className={`rounded-2xl border transition-colors ${
        step.archived
          ? 'bg-slate-900/20 border-slate-800/40 opacity-60'
          : 'bg-slate-950/60 border-slate-800/60 hover:border-slate-700/70'
      }`}
    >
      <div className="p-4 flex items-start gap-3">
        <button
          onClick={() => onToggleComplete(step.id, !step.completed)}
          className="mt-0.5 flex-shrink-0"
        >
          {step.completed ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <Circle className="w-5 h-5 text-slate-500 hover:text-slate-300" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Step {index + 1}</span>
            {step.ai_generated && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                <Sparkles className="w-3 h-3" />
                AI
              </span>
            )}
            {step.archived && (
              <span className="text-xs text-slate-500 italic">Archived</span>
            )}
          </div>

          {editingTitle ? (
            <input
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') {
                  setTitleValue(step.title);
                  setEditingTitle(false);
                }
              }}
              autoFocus
              className="mt-1 w-full bg-slate-950/60 border border-slate-700/70 rounded-lg px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
            />
          ) : (
            <div
              onClick={() => setEditingTitle(true)}
              className={`mt-1 font-medium text-slate-100 cursor-pointer hover:text-blue-200 ${
                step.completed ? 'line-through opacity-75' : ''
              }`}
            >
              {step.title}
            </div>
          )}

          {step.description && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-sm text-blue-400 hover:text-blue-300"
            >
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          )}

          {expanded && (
            <textarea
              value={descValue}
              onChange={(e) => setDescValue(e.target.value)}
              onBlur={saveDescription}
              placeholder="Add description..."
              className="mt-2 w-full bg-slate-950/60 border border-slate-800/60 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35 resize-none"
              rows={3}
            />
          )}
        </div>

        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded-lg hover:bg-slate-800/50 text-slate-400"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-8 z-20 w-40 rounded-2xl border border-slate-800/60 bg-slate-950/95 backdrop-blur shadow-xl overflow-hidden">
                <button
                  onClick={() => {
                    onArchive(step.id);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-900/50"
                >
                  Archive
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this step?')) {
                      onDelete(step.id);
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
