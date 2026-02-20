import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Sparkles,
  Archive,
  MoreVertical,
  GripVertical,
  Plus,
  Columns3,
  Trash2,
  X,
} from 'lucide-react';
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

type PlannerBoardColumn = {
  id: string;
  name: string;
  position: number;
};

export function PlannerView({
  projectId,
  focusNewTaskSignal = 0,
  openGenerateSignal = 0,
}: {
  projectId: string;
  focusNewTaskSignal?: number;
  openGenerateSignal?: number;
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
        <GeneratePlannerModal onClose={() => setAiModalOpen(false)} />
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
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelected(step.id, e.shiftKey ? 'range' : 'toggle');
            }}
            onChange={() => {}}
            className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500/40"
            title="Select task (use Shift/Ctrl for multi-select)"
          />
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

function GeneratePlannerModal({ onClose }: { onClose: () => void }) {
  const [goal, setGoal] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <button className="absolute inset-0" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-3xl rounded-3xl border border-slate-800/60 bg-slate-950/95 backdrop-blur shadow-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">Generate Plan with AI</div>
            <div className="text-sm text-slate-300 mt-1">
              Preview modal structure for the AI plan builder workflow.
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45 text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-800/60 bg-slate-950/50 p-4">
            <div className="text-sm font-medium text-slate-200 mb-2">1) Project goal</div>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What do you want done? (example: ship MVP by end of month)"
              rows={4}
              className="w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35 resize-none"
            />

            <div className="text-sm font-medium text-slate-200 mt-4 mb-2">2) Include sources</div>
            <label className="flex items-center gap-2 text-sm text-slate-300 mb-2">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-700 bg-slate-900" />
              Existing planner tasks
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 mb-2">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-700 bg-slate-900" />
              Board cards
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-700 bg-slate-900" />
              Files and docs (future)
            </label>
          </div>

          <div className="rounded-2xl border border-slate-800/60 bg-slate-950/50 p-4">
            <div className="text-sm font-medium text-slate-200 mb-3">3) Preview output</div>
            <div className="space-y-2">
              <div className="rounded-xl border border-blue-500/25 bg-blue-500/8 p-3">
                <div className="text-sm font-medium text-blue-200">Draft kickoff checklist</div>
                <div className="text-xs text-blue-200/70 mt-1">Dependencies, scope, owners</div>
              </div>
              <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
                <div className="text-sm font-medium text-slate-200">Build first implementation</div>
                <div className="text-xs text-slate-400 mt-1">Milestone estimate + acceptance criteria</div>
              </div>
              <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
                <div className="text-sm font-medium text-slate-200">QA and launch prep</div>
                <div className="text-xs text-slate-400 mt-1">Testing pass, edge cases, release notes</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          Preview only: this modal is a UI structure for the upcoming AI planning flow.
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-800/70 bg-slate-900/30 hover:bg-slate-900/45 text-slate-200"
          >
            Close
          </button>
          <button
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white"
            title="Demo only"
          >
            <Sparkles className="w-4 h-4" />
            Generate Example Plan
          </button>
        </div>
      </div>
    </div>
  );
}
