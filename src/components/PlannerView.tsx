import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, Sparkles, Archive, MoreVertical, GripVertical, Plus } from 'lucide-react';
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

export function PlannerView({
  projectId,
  focusNewTaskSignal = 0,
}: {
  projectId: string;
  focusNewTaskSignal?: number;
}) {
  const [steps, setSteps] = useState<PlannerStep[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  async function loadSteps() {
    setLoading(true);
    const { data, error } = await supabase
      .from('project_planner_steps')
      .select('*')
      .eq('project_id', projectId)
      .order('position', { ascending: true });

    if (error) {
      console.error('Error loading steps:', error);
      setLoading(false);
      return;
    }

    setSteps((data as PlannerStep[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    loadSteps();
  }, [projectId]);

  useEffect(() => {
    if (!focusNewTaskSignal) return;
    titleRef.current?.focus();
  }, [focusNewTaskSignal]);

  const filteredSteps = useMemo(
    () => (showArchived ? steps : steps.filter((s) => !s.archived)),
    [showArchived, steps],
  );

  const completedCount = steps.filter((s) => s.completed && !s.archived).length;
  const totalCount = steps.filter((s) => !s.archived).length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  async function toggleComplete(stepId: string, completed: boolean) {
    await supabase
      .from('project_planner_steps')
      .update({ completed, updated_at: new Date().toISOString() })
      .eq('id', stepId);

    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, completed } : s)));
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

  async function createStep() {
    const title = newTitle.trim();
    if (!title) return;

    setCreating(true);
    const nextPosition = Math.max(0, ...steps.map((s) => s.position || 0)) + 10;

    const { data, error } = await supabase
      .from('project_planner_steps')
      .insert({
        project_id: projectId,
        title,
        description: newDescription.trim(),
        completed: false,
        archived: false,
        ai_generated: false,
        position: nextPosition,
      })
      .select('*')
      .single();

    setCreating(false);
    if (error) {
      console.error('Error creating step:', error);
      return;
    }

    if (data) {
      setSteps((prev) => [...prev, data as PlannerStep].sort((a, b) => a.position - b.position));
      setNewTitle('');
      setNewDescription('');
      titleRef.current?.focus();
    }
  }

  async function reorderSteps(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const sourceIdx = filteredSteps.findIndex((s) => s.id === sourceId);
    const targetIdx = filteredSteps.findIndex((s) => s.id === targetId);
    if (sourceIdx < 0 || targetIdx < 0) return;

    const moved = [...filteredSteps];
    const [dragged] = moved.splice(sourceIdx, 1);
    moved.splice(targetIdx, 0, dragged);

    const updates = moved.map((s, idx) => ({ id: s.id, position: (idx + 1) * 10 }));

    setSteps((prev) =>
      prev
        .map((s) => {
          const update = updates.find((u) => u.id === s.id);
          return update ? { ...s, position: update.position } : s;
        })
        .sort((a, b) => a.position - b.position),
    );

    await Promise.all(
      updates.map((u) =>
        supabase
          .from('project_planner_steps')
          .update({ position: u.position, updated_at: new Date().toISOString() })
          .eq('id', u.id),
      ),
    );
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6 min-h-[520px] flex items-center justify-center">
        <div className="text-slate-400">Loading planner...</div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6 min-h-[520px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-blue-500/30 bg-blue-500/10 text-blue-200 text-sm">
            <Sparkles className="w-4 h-4" />
            <span>Generate with AI</span>
          </button>
          <div>
            <div className="text-2xl font-semibold">Planner</div>
            <div className="text-slate-300">
              {completedCount} of {totalCount} tasks completed ({progressPercent}%)
            </div>
          </div>
        </div>

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
      </div>

      <div className="mt-2 h-2 bg-slate-900/50 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-800/60 bg-slate-950/50 p-4">
        <div className="text-sm font-medium text-slate-200">Manual Task Mode</div>
        <div className="mt-3 flex flex-col md:flex-row gap-3">
          <input
            ref={titleRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createStep();
            }}
            placeholder="Task title"
            className="flex-1 rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
          />
          <button
            onClick={createStep}
            disabled={creating || !newTitle.trim()}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl transition-colors ${
              newTitle.trim() && !creating
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Adding...' : 'Add Task'}
          </button>
        </div>
        <textarea
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={3}
          className="mt-3 w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35 resize-none"
        />
      </div>

      <div className="mt-6 space-y-3">
        {filteredSteps.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/60 bg-slate-950/45 p-6 text-slate-400">
            No tasks yet. Add a task above, then drag tasks to place them in your timeline.
          </div>
        ) : (
          filteredSteps.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              index={index}
              isDragOver={dragOverId === step.id}
              onDragStart={(id) => setDraggingId(id)}
              onDragOver={(id) => setDragOverId(id)}
              onDrop={async (id) => {
                if (draggingId) await reorderSteps(draggingId, id);
                setDraggingId(null);
                setDragOverId(null);
              }}
              onToggleComplete={toggleComplete}
              onUpdateTitle={updateStepTitle}
              onUpdateDescription={updateStepDescription}
              onArchive={archiveStep}
              onDelete={deleteStep}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StepCard({
  step,
  index,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onToggleComplete,
  onUpdateTitle,
  onUpdateDescription,
  onArchive,
  onDelete,
}: {
  step: PlannerStep;
  index: number;
  isDragOver: boolean;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
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
      draggable={!step.archived}
      onDragStart={(e) => {
        if (step.archived) return;
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(step.id);
      }}
      onDragOver={(e) => {
        if (step.archived) return;
        e.preventDefault();
        onDragOver(step.id);
      }}
      onDrop={(e) => {
        if (step.archived) return;
        e.preventDefault();
        onDrop(step.id);
      }}
      className={`rounded-2xl border transition-colors ${
        step.archived
          ? 'bg-slate-900/20 border-slate-800/40 opacity-60'
          : isDragOver
            ? 'bg-blue-500/10 border-blue-500/40'
            : 'bg-slate-950/60 border-slate-800/60 hover:border-slate-700/70'
      }`}
    >
      <div className="p-4 flex items-start gap-3">
        <div className="mt-0.5 text-slate-500 cursor-grab">
          <GripVertical className="w-4 h-4" />
        </div>

        <button onClick={() => onToggleComplete(step.id, !step.completed)} className="mt-0.5 flex-shrink-0">
          {step.completed ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <Circle className="w-5 h-5 text-slate-500 hover:text-slate-300" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Task {index + 1}</span>
            {step.ai_generated && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                <Sparkles className="w-3 h-3" />
                AI
              </span>
            )}
            {step.archived && <span className="text-xs text-slate-500 italic">Archived</span>}
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
            <button onClick={() => setExpanded(!expanded)} className="mt-2 text-sm text-blue-400 hover:text-blue-300">
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
          <button onClick={() => setShowMenu(!showMenu)} className="p-1 rounded-lg hover:bg-slate-800/50 text-slate-400">
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
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
                    if (confirm('Delete this task?')) onDelete(step.id);
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
