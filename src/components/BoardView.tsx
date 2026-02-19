import { useState, useEffect } from 'react';
import { Plus, MoreVertical, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type BoardColumn = {
  id: string;
  project_id: string;
  name: string;
  position: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

type BoardCard = {
  id: string;
  column_id: string;
  project_id: string;
  title: string;
  description: string;
  priority: 'none' | 'low' | 'medium' | 'high';
  due_date: string | null;
  assignee_name: string | null;
  position: number;
  archived: boolean;
  completed: boolean;
  created_at: string;
  updated_at: string;
};

export function BoardView({ projectId }: { projectId: string }) {
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [addingLane, setAddingLane] = useState(false);
  const [newLaneName, setNewLaneName] = useState('');

  async function loadBoard() {
    const [colsRes, cardsRes] = await Promise.all([
      supabase
        .from('project_board_columns')
        .select('*')
        .eq('project_id', projectId)
        .eq('archived', false)
        .order('position', { ascending: true }),
      supabase
        .from('project_board_cards')
        .select('*')
        .eq('project_id', projectId)
        .eq('archived', false)
        .order('position', { ascending: true }),
    ]);

    if (colsRes.error) console.error('Error loading columns:', colsRes.error);
    if (cardsRes.error) console.error('Error loading cards:', cardsRes.error);

    const loadedColumns = (colsRes.data as BoardColumn[]) || [];
    setColumns(loadedColumns);
    setCards((cardsRes.data as BoardCard[]) || []);

    if (loadedColumns.length === 0) {
      await createDefaultColumns();
    }

    setLoading(false);
  }

  async function createDefaultColumns() {
    const defaultCols = ['To Do', 'In Progress', 'Done'];
    for (let i = 0; i < defaultCols.length; i++) {
      const { data } = await supabase
        .from('project_board_columns')
        .insert({
          project_id: projectId,
          name: defaultCols[i],
          position: i * 10,
          archived: false,
        })
        .select('*')
        .single();

      if (data) {
        setColumns((prev) => [...prev, data as BoardColumn]);
      }
    }
  }

  async function createColumn(name: string) {
    const laneName = name.trim();
    if (!laneName) return;

    const nextPosition = Math.max(0, ...columns.map((c) => c.position || 0)) + 10;
    const { data, error } = await supabase
      .from('project_board_columns')
      .insert({
        project_id: projectId,
        name: laneName,
        position: nextPosition,
        archived: false,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Error creating column:', error);
      return;
    }

    if (data) {
      setColumns((prev) => [...prev, data as BoardColumn].sort((a, b) => a.position - b.position));
      setAddingLane(false);
      setNewLaneName('');
    }
  }

  useEffect(() => {
    loadBoard();
  }, [projectId]);

  async function createCard(columnId: string, title: string) {
    const { data } = await supabase
      .from('project_board_cards')
      .insert({
        project_id: projectId,
        column_id: columnId,
        title,
        description: '',
        priority: 'none',
        position: await getNextCardPosition(columnId),
        archived: false,
        completed: false,
      })
      .select('*')
      .single();

    if (data) {
      setCards((prev) => [...prev, data as BoardCard]);
    }
  }

  async function getNextCardPosition(columnId: string) {
    const colCards = cards.filter((c) => c.column_id === columnId);
    if (colCards.length === 0) return 10;
    const maxPos = Math.max(...colCards.map((c) => c.position));
    return maxPos + 10;
  }

  async function moveCard(cardId: string, newColumnId: string) {
    const newPosition = await getNextCardPosition(newColumnId);

    await supabase
      .from('project_board_cards')
      .update({
        column_id: newColumnId,
        position: newPosition,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cardId);

    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId ? { ...c, column_id: newColumnId, position: newPosition } : c
      )
    );
  }

  function handleDragStart(cardId: string) {
    setDraggedCard(cardId);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDrop(columnId: string) {
    if (draggedCard) {
      moveCard(draggedCard, columnId);
      setDraggedCard(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6 min-h-[520px] flex items-center justify-center">
        <div className="text-slate-400">Loading board...</div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-4 sm:p-6 min-h-[520px]">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="text-2xl font-semibold">Board</div>
            <div className="text-slate-300">Organize tasks across columns</div>
          </div>
          {!addingLane ? (
            <button
              onClick={() => setAddingLane(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Swim Lane
            </button>
          ) : null}
        </div>

        {addingLane && (
          <div className="mb-4 rounded-2xl border border-slate-800/60 bg-slate-950/45 p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                type="text"
                value={newLaneName}
                onChange={(e) => setNewLaneName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void createColumn(newLaneName);
                  }
                  if (e.key === 'Escape') {
                    setAddingLane(false);
                    setNewLaneName('');
                  }
                }}
                placeholder="Lane name (e.g. QA, Blocked)"
                autoFocus
                className="flex-1 rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void createColumn(newLaneName)}
                  disabled={!newLaneName.trim()}
                  className={`px-3 py-2 rounded-xl text-sm transition-colors ${
                    newLaneName.trim()
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  Create Lane
                </button>
                <button
                  onClick={() => {
                    setAddingLane(false);
                    setNewLaneName('');
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-800/70 hover:bg-slate-900/45 text-slate-300 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 snap-x snap-mandatory">
          {columns.map((col) => (
            <BoardColumnView
              key={col.id}
              column={col}
              cards={cards.filter((c) => c.column_id === col.id)}
              onCreateCard={createCard}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onCardClick={setSelectedCard}
            />
          ))}
        </div>
      </div>

      {selectedCard && (
        <CardModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onUpdate={(updates) => {
            setCards((prev) =>
              prev.map((c) => (c.id === selectedCard.id ? { ...c, ...updates } : c))
            );
          }}
          onDelete={(cardId) => {
            setCards((prev) => prev.filter((c) => c.id !== cardId));
            setSelectedCard(null);
          }}
        />
      )}
    </>
  );
}

function BoardColumnView({
  column,
  cards,
  onCreateCard,
  onDragStart,
  onDragOver,
  onDrop,
  onCardClick,
}: {
  column: BoardColumn;
  cards: BoardCard[];
  onCreateCard: (columnId: string, title: string) => void;
  onDragStart: (cardId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (columnId: string) => void;
  onCardClick: (card: BoardCard) => void;
}) {
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');

  const handleAddCard = () => {
    if (newCardTitle.trim()) {
      onCreateCard(column.id, newCardTitle.trim());
      setNewCardTitle('');
      setAddingCard(false);
    }
  };

  return (
    <div
      className="flex-shrink-0 w-[min(85vw,24rem)] sm:w-[22rem] rounded-2xl border border-slate-800/60 bg-slate-950/40 p-3 sm:p-4 snap-start"
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(column.id);
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold text-slate-100">{column.name}</div>
          <div className="text-xs text-slate-400">{cards.length} tasks</div>
        </div>
        <button
          onClick={() => setAddingCard(true)}
          className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2 min-h-[200px]">
        {cards.map((card) => (
          <CardItem
            key={card.id}
            card={card}
            onDragStart={() => onDragStart(card.id)}
            onClick={() => onCardClick(card)}
          />
        ))}

        {addingCard && (
          <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
            <input
              type="text"
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddCard();
                if (e.key === 'Escape') {
                  setAddingCard(false);
                  setNewCardTitle('');
                }
              }}
              placeholder="Task title..."
              autoFocus
              className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={handleAddCard}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setAddingCard(false);
                  setNewCardTitle('');
                }}
                className="px-3 py-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CardItem({
  card,
  onDragStart,
  onClick,
}: {
  card: BoardCard;
  onDragStart: () => void;
  onClick: () => void;
}) {
  const priorityColors = {
    none: 'border-slate-700/50',
    low: 'border-blue-500/30 bg-blue-500/5',
    medium: 'border-amber-500/30 bg-amber-500/5',
    high: 'border-red-500/30 bg-red-500/5',
  };

  const priorityBadges = {
    low: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
    medium: 'bg-amber-500/15 text-amber-200 border-amber-500/25',
    high: 'bg-red-500/15 text-red-300 border-red-500/25',
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onClick={onClick}
      className={`rounded-xl border ${priorityColors[card.priority]} bg-slate-900/30 p-3 cursor-pointer hover:bg-slate-900/50 transition-colors`}
    >
      <div className="text-sm font-medium text-slate-100 mb-2">{card.title}</div>

      <div className="flex items-center gap-2 flex-wrap">
        {card.priority !== 'none' && (
          <span className={`px-2 py-0.5 rounded-full border text-xs ${priorityBadges[card.priority]}`}>
            {card.priority}
          </span>
        )}

        {card.assignee_name && (
          <span className="px-2 py-0.5 rounded-full bg-slate-700/30 border border-slate-700/50 text-xs text-slate-300">
            {card.assignee_name}
          </span>
        )}

        {card.due_date && (
          <span className="text-xs text-slate-400">
            {new Date(card.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

function CardModal({
  card,
  onClose,
  onUpdate,
  onDelete,
}: {
  card: BoardCard;
  onClose: () => void;
  onUpdate: (updates: Partial<BoardCard>) => void;
  onDelete: (cardId: string) => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [priority, setPriority] = useState(card.priority);
  const [dueDate, setDueDate] = useState(card.due_date || '');
  const [assignee, setAssignee] = useState(card.assignee_name || '');
  const [completed, setCompleted] = useState(card.completed);

  async function saveChanges() {
    const updates = {
      title,
      description,
      priority,
      due_date: dueDate || null,
      assignee_name: assignee || null,
      completed,
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from('project_board_cards')
      .update(updates)
      .eq('id', card.id);

    onUpdate(updates);
  }

  async function handleDelete() {
    if (confirm('Delete this card?')) {
      await supabase.from('project_board_cards').delete().eq('id', card.id);
      onDelete(card.id);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-800/60 bg-slate-950/95 backdrop-blur shadow-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveChanges}
              className="w-full text-xl font-semibold bg-transparent text-slate-100 focus:outline-none"
            />
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800/50 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveChanges}
              placeholder="Add details..."
              className="w-full h-32 rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Priority</label>
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value as any);
                  setTimeout(saveChanges, 100);
                }}
                className="w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
              >
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                onBlur={saveChanges}
                className="w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Assignee</label>
            <input
              type="text"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              onBlur={saveChanges}
              placeholder="Assignee name (optional)"
              className="w-full rounded-xl bg-slate-950/60 border border-slate-800/60 px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/35"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="completed"
              checked={completed}
              onChange={(e) => {
                setCompleted(e.target.checked);
                setTimeout(saveChanges, 100);
              }}
              className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500/35"
            />
            <label htmlFor="completed" className="text-sm text-slate-300">
              Mark as completed
            </label>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800/60">
            <button
              onClick={handleDelete}
              className="px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm transition-colors"
            >
              Delete Card
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
