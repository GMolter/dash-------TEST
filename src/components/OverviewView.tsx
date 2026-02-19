import { useState, useEffect } from 'react';
import { Columns3, CalendarDays, FileText, Link2, Sparkles, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Stats = {
  totalCards: number;
  completedCards: number;
  totalSteps: number;
  completedSteps: number;
  totalFiles: number;
  totalResources: number;
};

type OverviewTab = 'overview' | 'board' | 'planner' | 'files' | 'resources';

export function OverviewView({
  projectId,
  onNavigate,
  onOpenGeneratePlan,
}: {
  projectId: string;
  onNavigate?: (tab: OverviewTab) => void;
  onOpenGeneratePlan?: () => void;
}) {
  const [stats, setStats] = useState<Stats>({
    totalCards: 0,
    completedCards: 0,
    totalSteps: 0,
    completedSteps: 0,
    totalFiles: 0,
    totalResources: 0,
  });
  const [loading, setLoading] = useState(true);

  async function loadStats() {
    const [cardsRes, stepsRes, filesRes, resourcesRes] = await Promise.all([
      supabase
        .from('project_board_cards')
        .select('completed')
        .eq('project_id', projectId)
        .eq('archived', false),
      supabase
        .from('project_planner_steps')
        .select('completed')
        .eq('project_id', projectId)
        .eq('archived', false),
      supabase.from('project_files').select('id').eq('project_id', projectId),
      supabase.from('project_resources').select('id').eq('project_id', projectId),
    ]);

    const cards = (cardsRes.data || []) as { completed: boolean }[];
    const steps = (stepsRes.data || []) as { completed: boolean }[];

    setStats({
      totalCards: cards.length,
      completedCards: cards.filter((c) => c.completed).length,
      totalSteps: steps.length,
      completedSteps: steps.filter((s) => s.completed).length,
      totalFiles: (filesRes.data || []).length,
      totalResources: (resourcesRes.data || []).length,
    });

    setLoading(false);
  }

  useEffect(() => {
    loadStats();
  }, [projectId]);

  const cardProgress =
    stats.totalCards > 0 ? Math.round((stats.completedCards / stats.totalCards) * 100) : 0;
  const stepProgress =
    stats.totalSteps > 0 ? Math.round((stats.completedSteps / stats.totalSteps) * 100) : 0;
  const overallProgress = Math.round(cardProgress * 0.7 + stepProgress * 0.3);
  const openTaskCount = stats.totalSteps - stats.completedSteps;
  const openCardCount = stats.totalCards - stats.completedCards;
  const executionLabel =
    overallProgress >= 75 ? 'Strong momentum' : overallProgress >= 40 ? 'Steady progress' : 'Needs focus';
  const suggestedAction =
    openTaskCount > openCardCount ? 'Planner has more open work. Tighten priorities first.' : 'Board has more open work. Move blockers to active lanes.';

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6 min-h-[520px] flex items-center justify-center">
        <div className="text-slate-400">Loading overview...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6">
        <div className="text-2xl font-semibold mb-6">Overview</div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Columns3 className="w-5 h-5 text-blue-400" />}
            label="Board Tasks"
            value={stats.totalCards}
            subtext={`${stats.completedCards} completed`}
            color="blue"
          />
          <StatCard
            icon={<CalendarDays className="w-5 h-5 text-emerald-400" />}
            label="Planner Steps"
            value={stats.totalSteps}
            subtext={`${stats.completedSteps} completed`}
            color="emerald"
          />
          <StatCard
            icon={<FileText className="w-5 h-5 text-purple-400" />}
            label="Files"
            value={stats.totalFiles}
            subtext="Documents & uploads"
            color="purple"
          />
          <StatCard
            icon={<Link2 className="w-5 h-5 text-amber-400" />}
            label="Resources"
            value={stats.totalResources}
            subtext="External links"
            color="amber"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-slate-400" />
            <div className="text-lg font-semibold">Progress</div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Overall Progress</span>
                <span className="text-lg font-semibold text-slate-100">{overallProgress}%</span>
              </div>
              <div className="h-3 bg-slate-900/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Board Tasks</span>
                <span className="text-sm font-medium text-slate-300">{cardProgress}%</span>
              </div>
              <div className="h-2 bg-slate-900/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${cardProgress}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Planner Steps</span>
                <span className="text-sm font-medium text-slate-300">{stepProgress}%</span>
              </div>
              <div className="h-2 bg-slate-900/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${stepProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-slate-400" />
            <div className="text-lg font-semibold">Project Signals</div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-300" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-blue-200">{executionLabel}</div>
                <div className="text-xs text-blue-300/70">{overallProgress}% overall completion</div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-3">
              <div className="text-sm text-slate-200">Open workload</div>
              <div className="mt-1 text-xs text-slate-400">
                {openTaskCount} planner tasks and {openCardCount} board cards still open.
              </div>
            </div>

            <div className="text-sm text-slate-400">{suggestedAction}</div>

            <button
              onClick={() => onNavigate?.(openTaskCount > openCardCount ? 'planner' : 'board')}
              className="w-full px-4 py-2 rounded-xl border border-slate-700/70 bg-slate-900/35 hover:bg-slate-900/50 text-slate-200 text-sm transition-colors"
            >
              Jump to Suggested Workspace
            </button>
            <button
              onClick={onOpenGeneratePlan}
              className="w-full px-4 py-2 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 text-sm transition-colors"
            >
              Open AI Plan Builder
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800/60 bg-slate-950/35 backdrop-blur p-6">
        <div className="text-lg font-semibold mb-4">Quick Actions</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickActionButton
            icon={<Columns3 className="w-5 h-5" />}
            label="Go to Board"
            count={stats.totalCards}
            onClick={() => onNavigate?.('board')}
          />
          <QuickActionButton
            icon={<CalendarDays className="w-5 h-5" />}
            label="Go to Planner"
            count={stats.totalSteps}
            onClick={() => onNavigate?.('planner')}
          />
          <QuickActionButton
            icon={<FileText className="w-5 h-5" />}
            label="Go to Files"
            count={stats.totalFiles}
            onClick={() => onNavigate?.('files')}
          />
          <QuickActionButton
            icon={<Link2 className="w-5 h-5" />}
            label="Go to Resources"
            count={stats.totalResources}
            onClick={() => onNavigate?.('resources')}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subtext: string;
  color: string;
}) {
  const bgColors: Record<string, string> = {
    blue: 'bg-blue-500/10',
    emerald: 'bg-emerald-500/10',
    purple: 'bg-purple-500/10',
    amber: 'bg-amber-500/10',
  };

  const borderColors: Record<string, string> = {
    blue: 'border-blue-500/20',
    emerald: 'border-emerald-500/20',
    purple: 'border-purple-500/20',
    amber: 'border-amber-500/20',
  };

  return (
    <div
      className={`rounded-2xl border ${borderColors[color]} ${bgColors[color]} p-4`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-lg ${bgColors[color]} flex items-center justify-center`}>
          {icon}
        </div>
        <div className="text-sm text-slate-400">{label}</div>
      </div>
      <div className="text-3xl font-bold text-slate-100 mb-1">{value}</div>
      <div className="text-xs text-slate-500">{subtext}</div>
    </div>
  );
}

function QuickActionButton({
  icon,
  label,
  count,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-slate-800/60 bg-slate-950/40 hover:bg-slate-900/50 hover:border-slate-700/70 transition-colors"
    >
      <div className="text-slate-300">{icon}</div>
      <div className="text-sm font-medium text-slate-200 text-center">{label}</div>
      {count > 0 && <div className="text-xs text-slate-400">{count} items</div>}
    </button>
  );
}
