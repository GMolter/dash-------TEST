import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Circle,
  Sparkles,
  Check,
  Archive,
  MoreVertical,
  GripVertical,
  Plus,
  Columns3,
  Trash2,
  Loader2,
  ChevronRight,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type PlannerStep = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  due_date: string | null;
  completed: boolean;
  position: number;
  archived: boolean;
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
};

type GeneratedPlannerTask = {
  title: string;
  description: string;
  due_date: string | null;
};

type GeneratedDeletionSuggestion = {
  source: 'planner' | 'board';
  id: string;
  title: string;
  reason: string;
};

type PlannerBoardColumn = {
  id: string;
  name: string;
  position: number;
};

export function PlannerView({
  projectId,
  focusNewTaskSignal = 0,
  openGenerateSignal = 0,
  onAiUsageUpdate,
}: {
  projectId: string;
  focusNewTaskSignal?: number;
  openGenerateSignal?: number;
  onAiUsageUpdate?: (usage: {
    used: number;
    limit: number;
    unlimited: boolean;
    remaining: number | null;
  }) => void;
}) {
  const [steps, setSteps] = useState<PlannerStep[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [lastSelectedStepId, setLastSelectedStepId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [showDescriptionInput, setShowDescriptionInput] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const lastGenerateSignalRef = useRef(openGenerateSignal);

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
    if (loading) return;
    titleRef.current?.focus();
  }, [focusNewTaskSignal, loading]);

  useEffect(() => {
    if (openGenerateSignal === lastGenerateSignalRef.current) return;
    lastGenerateSignalRef.current = openGenerateSignal;
    setAiModalOpen(true);
  }, [openGenerateSignal]);

  const filteredSteps = useMemo(
    () => (showArchived ? steps : steps.filter((s) => !s.archived)),
    [showArchived, steps],
  );

  const completedCount = steps.filter((s) => s.completed && !s.archived).length;
  const totalCount = steps.filter((s) => !s.archived).length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  function clearSelection() {
    setSelectedStepIds([]);
    setLastSelectedStepId(null);
  }

  function selectRange(toStepId: string) {
    if (!lastSelectedStepId) {
      setSelectedStepIds([toStepId]);
      setLastSelectedStepId(toStepId);
      return;
    }

    const startIdx = filteredSteps.findIndex((s) => s.id === lastSelectedStepId);
    const endIdx = filteredSteps.findIndex((s) => s.id === toStepId);
    if (startIdx < 0 || endIdx < 0) return;

    const [from, to] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
    const rangeIds = filteredSteps.slice(from, to + 1).map((s) => s.id);
    setSelectedStepIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
  }

  function toggleSingleSelection(stepId: string) {
    setSelectedStepIds((prev) =>
      prev.includes(stepId) ? prev.filter((id) => id !== stepId) : [...prev, stepId],
    );
    setLastSelectedStepId(stepId);
  }

  function handleStepRowClick(stepId: string, e: React.MouseEvent) {
    if (selectionMode) {
      e.preventDefault();
      if (e.shiftKey) {
        selectRange(stepId);
        setLastSelectedStepId(stepId);
        return;
      }
      toggleSingleSelection(stepId);
      return;
    }

    if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return;
    e.preventDefault();

    if (e.shiftKey) {
      selectRange(stepId);
      setLastSelectedStepId(stepId);
      return;
    }

    toggleSingleSelection(stepId);
  }

  async function deleteSelectedSteps() {
    if (!selectedStepIds.length) return;
    if (!confirm(`Delete ${selectedStepIds.length} selected task(s)? This cannot be undone.`)) return;

    setBulkWorking(true);
    setBulkMessage(null);
    const { error } = await supabase.from('project_planner_steps').delete().in('id', selectedStepIds);
    setBulkWorking(false);

    if (error) {
      console.error('Error deleting selected tasks:', error);
      setBulkMessage('Failed to delete selected tasks.');
      return;
    }

    setSteps((prev) => prev.filter((s) => !selectedStepIds.includes(s.id)));
    setBulkMessage(`${selectedStepIds.length} task(s) deleted.`);
    clearSelection();
  }

  async function convertSelectedToCards() {
    if (!selectedStepIds.length) return;
    setBulkWorking(true);
    setBulkMessage(null);

    const selectedSteps = steps.filter((s) => selectedStepIds.includes(s.id) && !s.archived);
    if (!selectedSteps.length) {
      setBulkWorking(false);
      setBulkMessage('No active tasks selected for conversion.');
      return;
    }

    let { data: columns, error: colsError } = await supabase
      .from('project_board_columns')
      .select('*')
      .eq('project_id', projectId)
      .eq('archived', false)
      .order('position', { ascending: true });

    if (colsError) {
      setBulkWorking(false);
      console.error('Error loading board columns:', colsError);
      setBulkMessage('Could not load board columns.');
      return;
    }

    let boardColumns = (columns as PlannerBoardColumn[] | null) || [];

    if (!boardColumns.length) {
      const { data: created, error: createError } = await supabase
        .from('project_board_columns')
        .insert({
          project_id: projectId,
          name: 'To Do',
          position: 10,
          archived: false,
        })
        .select('*')
        .single();

      if (createError || !created) {
        setBulkWorking(false);
        console.error('Error creating default column:', createError);
        setBulkMessage('Could not create a target swim lane.');
        return;
      }

      boardColumns = [created as PlannerBoardColumn];
    }

    const targetColumn =
      boardColumns.find((c) => (c.name || '').toLowerCase().includes('to do')) || boardColumns[0];

    const { data: maxPosData, error: maxPosError } = await supabase
      .from('project_board_cards')
      .select('position')
      .eq('column_id', targetColumn.id)
      .order('position', { ascending: false })
      .limit(1);

    if (maxPosError) {
      setBulkWorking(false);
      console.error('Error loading card position:', maxPosError);
      setBulkMessage('Could not determine card position.');
      return;
    }

    let nextPosition = (((maxPosData as { position: number }[] | null) || [])[0]?.position || 0) + 10;
    const cardsToInsert = selectedSteps.map((step) => {
      const card = {
        project_id: projectId,
        column_id: targetColumn.id,
        title: step.title,
        description: step.description || '',
        priority: 'none',
        due_date: step.due_date,
        position: nextPosition,
        archived: false,
        completed: step.completed,
      };
      nextPosition += 10;
      return card;
    });

    const { error: insertError } = await supabase.from('project_board_cards').insert(cardsToInsert);
    setBulkWorking(false);

    if (insertError) {
      console.error('Error converting tasks to cards:', insertError);
      setBulkMessage('Conversion failed.');
      return;
    }

    setBulkMessage(`Converted ${cardsToInsert.length} task(s) into board cards.`);
    clearSelection();
  }

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
    setSelectedStepIds((prev) => prev.filter((id) => id !== stepId));
  }

  async function deleteStep(stepId: string) {
    await supabase.from('project_planner_steps').delete().eq('id', stepId);
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
    setSelectedStepIds((prev) => prev.filter((id) => id !== stepId));
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
        due_date: null,
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

  async function acceptAiSuggestions(
    tasks: GeneratedPlannerTask[],
    deletions: GeneratedDeletionSuggestion[],
  ) {
    const plannerDeleteIds = deletions.filter((d) => d.source === 'planner').map((d) => d.id);
    const boardDeleteIds = deletions.filter((d) => d.source === 'board').map((d) => d.id);
    const shouldInsert = tasks.length > 0;

    if (!shouldInsert && !plannerDeleteIds.length && !boardDeleteIds.length) return false;

    let insertedSteps: PlannerStep[] = [];
    if (shouldInsert) {
      const maxPosition = Math.max(0, ...steps.map((s) => s.position || 0));
      const payload = tasks.map((task, idx) => ({
        project_id: projectId,
        title: task.title,
        description: task.description || '',
        due_date: task.due_date ? new Date(task.due_date).toISOString() : null,
        completed: false,
        archived: false,
        ai_generated: true,
        position: maxPosition + (idx + 1) * 10,
      }));

      const { data, error } = await supabase.from('project_planner_steps').insert(payload).select('*');
      if (error) {
        console.error('Error inserting AI suggestions:', error);
        return false;
      }
      insertedSteps = (data as PlannerStep[]) || [];
    }

    if (plannerDeleteIds.length) {
      const { error } = await supabase.from('project_planner_steps').delete().in('id', plannerDeleteIds);
      if (error) {
        console.error('Error deleting planner steps from AI suggestions:', error);
        return false;
      }
    }

    if (boardDeleteIds.length) {
      const { error } = await supabase.from('project_board_cards').delete().in('id', boardDeleteIds);
      if (error) {
        console.error('Error deleting board cards from AI suggestions:', error);
        return false;
      }
    }

    setSteps((prev) =>
      [...prev.filter((s) => !plannerDeleteIds.includes(s.id)), ...insertedSteps].sort((a, b) => a.position - b.position),
    );
    return true;
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
        <div>
          <div className="text-2xl font-semibold">Planner</div>
          <div className="text-slate-300">
            {completedCount} of {totalCount} tasks completed ({progressPercent}%)
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectionMode((prev) => {
                const next = !prev;
                if (!next) clearSelection();
                return next;
              });
            }}
            className={`px-3 py-2 rounded-2xl border text-sm transition-colors ${
              selectionMode
                ? 'bg-blue-500/20 border-blue-500/35 text-blue-200'
                : 'bg-slate-900/30 border-slate-800/70 text-slate-300 hover:bg-slate-900/45'
            }`}
          >
            {selectionMode ? 'Done Selecting' : 'Select Tasks'}
          </button>
          <button
            onClick={() => setAiModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 text-sm transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span>Generate with AI</span>
          </button>
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
      </div>

      <div className="mt-2 h-2 bg-slate-900/50 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="mt-5 rounded-2xl border border-slate-800/60 bg-slate-950/45 p-4">
        <div className="text-sm font-medium text-slate-200">Manual Task Mode</div>
        <div className="mt-3 flex flex-col lg:flex-row gap-3">
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
          className={`w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35 resize-none ${
            showDescriptionInput ? 'mt-3 block' : 'hidden'
          }`}
        />
        <button
          onClick={() => setShowDescriptionInput((v) => !v)}
          className="mt-3 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          {showDescriptionInput ? 'Hide description field' : 'Add optional description'}
        </button>
      </div>

      {selectionMode && selectedStepIds.length > 0 && (
        <div className="mt-4 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm text-blue-100">
              {selectedStepIds.length} task{selectedStepIds.length === 1 ? '' : 's'} selected
              <span className="ml-2 text-blue-200/80">(Shift/Ctrl click supported)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void convertSelectedToCards()}
                disabled={bulkWorking}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                  !bulkWorking
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Columns3 className="w-4 h-4" />
                Convert to Cards
              </button>
              <button
                onClick={() => void deleteSelectedSteps()}
                disabled={bulkWorking}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                  !bulkWorking
                    ? 'border border-red-500/40 bg-red-500/15 hover:bg-red-500/25 text-red-200'
                    : 'border border-slate-700 bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected
              </button>
              <button
                onClick={clearSelection}
                className="px-3 py-2 rounded-xl border border-slate-700/70 hover:bg-slate-900/40 text-slate-200 text-sm"
              >
                Clear
              </button>
            </div>
          </div>
          {bulkMessage && <div className="mt-2 text-xs text-blue-200/85">{bulkMessage}</div>}
        </div>
      )}

      {selectionMode && selectedStepIds.length === 0 && (
        <div className="mt-4 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-3 text-xs text-slate-400">
          Selection mode is on. Click tasks to select, or Shift-click to select a range.
        </div>
      )}

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
              selectionMode={selectionMode}
              selected={selectedStepIds.includes(step.id)}
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
              onRowClick={(id, e) => handleStepRowClick(id, e)}
              onToggleSelected={(id, mode) => {
                if (mode === 'range') {
                  selectRange(id);
                  setLastSelectedStepId(id);
                  return;
                }
                toggleSingleSelection(id);
              }}
            />
          ))
        )}
      </div>

      {aiModalOpen && (
        <GeneratePlannerModal
          projectId={projectId}
          currentSteps={steps}
          onAiUsageUpdate={onAiUsageUpdate}
          onAccept={acceptAiSuggestions}
          onClose={() => setAiModalOpen(false)}
        />
      )}
    </div>
  );
}

function StepCard({
  step,
  index,
  selectionMode,
  selected,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onToggleComplete,
  onUpdateTitle,
  onUpdateDescription,
  onArchive,
  onDelete,
  onRowClick,
  onToggleSelected,
}: {
  step: PlannerStep;
  index: number;
  selectionMode: boolean;
  selected: boolean;
  isDragOver: boolean;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
  onToggleComplete: (id: string, completed: boolean) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdateDescription: (id: string, description: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRowClick: (id: string, e: React.MouseEvent) => void;
  onToggleSelected: (id: string, mode: 'toggle' | 'range') => void;
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
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (target.closest('button, input, textarea, select, a, label')) return;
        onRowClick(step.id, e);
      }}
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
          : selected
            ? 'bg-blue-500/8 border-blue-500/40'
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

        {selectionMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelected(step.id, e.shiftKey ? 'range' : 'toggle');
            }}
            className={`mt-1 h-5 w-5 rounded-md border transition-colors flex items-center justify-center ${
              selected
                ? 'border-blue-400/80 bg-blue-500/25 text-blue-100'
                : 'border-slate-700/80 bg-slate-900/70 text-transparent hover:border-slate-500/80'
            }`}
            title="Select task (use Shift/Ctrl for multi-select)"
            type="button"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}

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
            {step.due_date && (
              <span className="text-xs text-amber-300/90">
                Due {new Date(step.due_date).toLocaleDateString()}
              </span>
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
              onClick={(e) => {
                if (selectionMode) {
                  e.stopPropagation();
                  onRowClick(step.id, e);
                  return;
                }
                if (e.shiftKey || e.ctrlKey || e.metaKey) return;
                setEditingTitle(true);
              }}
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

function GeneratePlannerModal({
  projectId,
  currentSteps,
  onAiUsageUpdate,
  onAccept,
  onClose,
}: {
  projectId: string;
  currentSteps: PlannerStep[];
  onAiUsageUpdate?: (usage: {
    used: number;
    limit: number;
    unlimited: boolean;
    remaining: number | null;
  }) => void;
  onAccept: (tasks: GeneratedPlannerTask[], deletions: GeneratedDeletionSuggestion[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const [goal, setGoal] = useState('');
  const [regenInstructions, setRegenInstructions] = useState('');
  const [includeExistingTasks, setIncludeExistingTasks] = useState(true);
  const [includeBoardCards, setIncludeBoardCards] = useState(true);
  const [allowDeletionSuggestions, setAllowDeletionSuggestions] = useState(false);
  const [working, setWorking] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedTasks, setGeneratedTasks] = useState<GeneratedPlannerTask[]>([]);
  const [deletionSuggestions, setDeletionSuggestions] = useState<
    Array<GeneratedDeletionSuggestion & { selected: boolean }>
  >([]);
  const [liveBuffer, setLiveBuffer] = useState<string[]>([]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function generate(mode: 'generate' | 'regenerate') {
    if (!goal.trim()) {
      setError('Add a project goal before generating.');
      return;
    }

    setWorking(true);
    setError(null);
    setLiveBuffer(['Preparing project context...']);

    const stagedBuffer = [
      'Collecting active planner tasks...',
      'Collecting board cards...',
      'Drafting ordered tasks with due dates...',
      allowDeletionSuggestions ? 'Evaluating stale tasks/cards for cleanup...' : 'Skipping cleanup analysis...',
      'Finalizing suggestions...',
    ];
    let bufferIdx = 0;
    let waitingShown = false;
    const timer = window.setInterval(() => {
      setLiveBuffer((prev) => {
        if (bufferIdx < stagedBuffer.length) {
          const next = [...prev, stagedBuffer[bufferIdx]];
          bufferIdx += 1;
          return next;
        }
        if (waitingShown) return prev;
        waitingShown = true;
        return [...prev, 'Waiting for AI response...'];
      });
    }, 850);

    let boardCards: Array<{
      id: string;
      title: string;
      description: string;
      due_date: string | null;
      completed: boolean;
    }> = [];
    if (includeBoardCards) {
      const { data, error: boardError } = await supabase
        .from('project_board_cards')
        .select('id,title,description,due_date,completed')
        .eq('project_id', projectId)
        .eq('archived', false)
        .order('position', { ascending: true })
        .limit(100);

      if (boardError) {
        console.error('Error loading board cards for AI context:', boardError);
      } else {
        boardCards = (data as typeof boardCards) || [];
      }
    }

    const payload = {
      projectId,
      goal: goal.trim(),
      additionalInstructions: mode === 'regenerate' ? regenInstructions.trim() : '',
      allowDeletionSuggestions,
      context: {
        plannerTasks: includeExistingTasks
          ? currentSteps
              .filter((task) => !task.archived)
              .slice(0, 100)
              .map((task) => ({
                id: task.id,
                title: task.title,
                description: task.description,
                due_date: task.due_date,
                completed: task.completed,
              }))
          : [],
        boardCards,
      },
    };

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || '';

      const response = await fetch('/api/planner/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      const json = (() => {
        try {
          return rawText ? JSON.parse(rawText) : {};
        } catch {
          return null;
        }
      })();
      if (!response.ok) {
        if (json?.usage && onAiUsageUpdate) onAiUsageUpdate(json.usage);
        const limitMessage =
          json?.code === 'AI_USAGE_LIMIT_REACHED'
            ? `AI usage limit reached (${json?.usage?.used ?? 5}/${json?.usage?.limit ?? 5}).`
            : null;
        const serverMessage =
          json && typeof json === 'object'
            ? [json?.error, json?.detail].filter((part) => typeof part === 'string' && part.trim()).join(' ')
            : '';
        const fallback =
          typeof rawText === 'string' && rawText.trim()
            ? rawText.slice(0, 220)
            : `Generation failed (HTTP ${response.status}).`;
        setError(limitMessage || serverMessage || fallback);
        return;
      }

      if (!json || typeof json !== 'object') {
        setError('Generation failed: invalid server response format.');
        return;
      }

      const tasks: GeneratedPlannerTask[] = Array.isArray(json?.tasks)
        ? json.tasks.map((task: any) => ({
            title: String(task?.title || '').trim(),
            description: String(task?.description || '').trim(),
            due_date:
              typeof task?.dueDate === 'string' && task.dueDate.trim()
                ? task.dueDate.trim()
                : typeof task?.due_date === 'string' && task.due_date.trim()
                  ? task.due_date.trim()
                  : null,
          }))
        : [];

      const deletions: Array<GeneratedDeletionSuggestion & { selected: boolean }> =
        allowDeletionSuggestions && Array.isArray(json?.deletions)
          ? json.deletions
              .map((item: any) => ({
                source: item?.source === 'board' ? 'board' : 'planner',
                id: String(item?.id || '').trim(),
                title: String(item?.title || '').trim(),
                reason: String(item?.reason || '').trim(),
                selected: true,
              }))
              .filter((item) => !!item.id)
          : [];

      setGeneratedTasks(tasks.filter((task) => !!task.title));
      setDeletionSuggestions(deletions);
      if (json?.usage && onAiUsageUpdate) onAiUsageUpdate(json.usage);
      setLiveBuffer((prev) => [
        ...prev,
        `Done. ${tasks.length} task suggestion(s), ${deletions.length} deletion suggestion(s).`,
      ]);
      if (mode === 'regenerate') setRegenInstructions('');
    } catch (err) {
      console.error('Failed to generate planner tasks:', err);
      setError('Unable to reach AI generation endpoint.');
    } finally {
      window.clearInterval(timer);
      setWorking(false);
    }
  }

  async function acceptSuggestions() {
    const selectedDeletions = deletionSuggestions
      .filter((item) => item.selected)
      .map(({ selected: _selected, ...item }) => item);
    if (!generatedTasks.length && !selectedDeletions.length) {
      setError('No selected suggestions to apply.');
      return;
    }

    setAccepting(true);
    setError(null);
    const ok = await onAccept(generatedTasks, selectedDeletions);
    setAccepting(false);
    if (!ok) {
      setError('Could not apply AI suggestions to your project.');
      return;
    }
    onClose();
  }

  const hasSuggestions = generatedTasks.length > 0 || deletionSuggestions.length > 0;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] isolate flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm">
      <button className="absolute inset-0" onClick={onClose} aria-label="Close" />
      <div className="relative w-[min(97vw,1680px)] h-[94vh] rounded-3xl border border-slate-800/60 bg-slate-950/95 backdrop-blur shadow-2xl p-5 sm:p-6 overflow-y-auto scrollbar-theme">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">Generate Plan with AI</div>
            <div className="text-sm text-slate-300 mt-1">
              Generate tasks, review due dates, and optionally apply AI-suggested cleanup.
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45 text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 pr-1 pb-32">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-800/60 bg-slate-950/50 p-4">
              <div className="text-sm font-medium text-slate-200 mb-2">1) Project goal</div>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="What do you want done? (example: ship MVP by end of month)"
                rows={4}
                className="w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35 resize-none"
              />

              <div className="text-sm font-medium text-slate-200 mt-4 mb-2">2) Include context</div>
              <div className="space-y-2">
                <ToggleOption
                  checked={includeExistingTasks}
                  onClick={() => setIncludeExistingTasks((v) => !v)}
                  label="Existing planner tasks"
                />
                <ToggleOption
                  checked={includeBoardCards}
                  onClick={() => setIncludeBoardCards((v) => !v)}
                  label="Board cards"
                />
                <ToggleOption
                  checked={allowDeletionSuggestions}
                  onClick={() => setAllowDeletionSuggestions((v) => !v)}
                  label="Allow AI deletion suggestions"
                />
              </div>

              <button
                onClick={() => void generate('generate')}
                disabled={working || !goal.trim()}
                className={`mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm ${
                  !working && goal.trim()
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              >
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {working ? 'Generating...' : hasSuggestions ? 'Generate Again' : 'Generate Suggestions'}
              </button>
            </div>

            <div className="rounded-2xl border border-slate-800/60 bg-slate-950/50 p-4">
              <div className="text-sm font-medium text-slate-200 mb-3">3) Suggested tasks</div>
              {generatedTasks.length === 0 ? (
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4 text-sm text-slate-400">
                  Suggestions will appear here after generation.
                </div>
              ) : (
                <div className="space-y-2">
                  {generatedTasks.map((task, idx) => (
                    <div
                      key={`${task.title}-${idx}`}
                      className={`rounded-xl border p-3 ${
                        idx === 0 ? 'border-blue-500/25 bg-blue-500/8' : 'border-slate-700/70 bg-slate-900/40'
                      }`}
                    >
                      <div className={`text-sm font-medium ${idx === 0 ? 'text-blue-200' : 'text-slate-200'}`}>
                        {task.title}
                      </div>
                      {task.description && (
                        <div className={`text-xs mt-1 ${idx === 0 ? 'text-blue-200/70' : 'text-slate-400'}`}>
                          {task.description}
                        </div>
                      )}
                      {task.due_date && <div className="text-xs mt-2 text-amber-300/85">Due {task.due_date}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {working && (
            <div className="mt-4 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4">
              <div className="flex items-center gap-2 text-sm text-blue-100 mb-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Live generation buffer
              </div>
              <div className="space-y-1 text-xs text-blue-200/90 font-medium">
                {liveBuffer.slice(-6).map((line, idx) => (
                  <div key={`${line}-${idx}`} className="flex items-center gap-2">
                    <ChevronRight className="w-3 h-3" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {allowDeletionSuggestions && deletionSuggestions.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4">
              <div className="text-sm font-medium text-amber-100 mb-2">4) AI suggested deletions</div>
              <div className="space-y-2">
                {deletionSuggestions.map((item, idx) => (
                  <div key={`${item.source}-${item.id}-${idx}`} className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-slate-100">
                          {item.title || '(Untitled)'}{' '}
                          <span className="text-xs text-slate-400">[{item.source === 'board' ? 'Board' : 'Planner'}]</span>
                        </div>
                        {item.reason && <div className="text-xs text-slate-400 mt-1">{item.reason}</div>}
                      </div>
                      <button
                        onClick={() =>
                          setDeletionSuggestions((prev) =>
                            prev.map((d, i) => (i === idx ? { ...d, selected: !d.selected } : d)),
                          )
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs border ${
                          item.selected
                            ? 'border-red-500/40 bg-red-500/15 text-red-200'
                            : 'border-slate-700/70 bg-slate-900/50 text-slate-300'
                        }`}
                      >
                        {item.selected ? 'Delete on accept' : 'Keep item'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasSuggestions && (
            <div className="mt-4 rounded-2xl border border-slate-800/60 bg-slate-950/50 p-4">
              <div className="text-sm font-medium text-slate-200 mb-2">Regenerate with extra context</div>
              <textarea
                value={regenInstructions}
                onChange={(e) => setRegenInstructions(e.target.value)}
                placeholder="Example: prioritize launch blockers first and avoid assigning due dates before March."
                rows={3}
                className="w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35 resize-none"
              />
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => void generate('regenerate')}
                  disabled={working || !goal.trim()}
                  className={`px-4 py-2.5 rounded-xl text-sm ${
                    !working && goal.trim()
                      ? 'border border-blue-500/40 bg-blue-500/15 hover:bg-blue-500/25 text-blue-200'
                      : 'border border-slate-700 bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {working ? 'Regenerating...' : 'Regenerate'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="pt-4 mt-4 border-t border-slate-800/70 flex flex-wrap items-center justify-end gap-2 sticky bottom-0 z-20 bg-slate-950/98 backdrop-blur-md shadow-[0_-10px_30px_rgba(2,6,23,0.85)]">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45 text-slate-200"
          >
            Close
          </button>
          {hasSuggestions && (
            <>
              <button
                onClick={() => {
                  setGeneratedTasks([]);
                  setDeletionSuggestions([]);
                  setLiveBuffer([]);
                }}
                disabled={working || accepting}
                className="px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Decline Suggestions
              </button>
              <button
                onClick={() => void acceptSuggestions()}
                disabled={working || accepting}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {accepting ? 'Applying Suggestions...' : 'Accept Suggestions'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ToggleOption({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
        checked
          ? 'border-blue-500/45 bg-blue-500/15 text-blue-100'
          : 'border-slate-700/70 bg-slate-900/35 text-slate-300 hover:bg-slate-900/50'
      }`}
    >
      <span
        className={`h-5 w-5 rounded-md border flex items-center justify-center ${
          checked ? 'border-blue-300/70 bg-blue-500/30 text-blue-50' : 'border-slate-600 text-transparent'
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      <span>{label}</span>
    </button>
  );
}
