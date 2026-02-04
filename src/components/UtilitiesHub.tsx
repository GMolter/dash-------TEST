import { useEffect, useState } from 'react';

type Tool = {
  id: string;
  label: string;
  icon: string;
  desc: string;
};

export function UtilitiesHub({
  tools,
  onOpenTool,
}: {
  tools: Tool[];
  onOpenTool: (toolId: string) => void;
}) {
  const [showDescriptions, setShowDescriptions] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('utilities_show_desc');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('utilities_show_desc', String(showDescriptions));
    } catch {
      // ignore
    }
  }, [showDescriptions]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-3xl font-semibold text-white">Utilities</h2>
        </div>

        <button
          onClick={() => setShowDescriptions((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-700 bg-slate-900/30 hover:bg-slate-900/50 text-slate-200 transition-colors"
          aria-pressed={showDescriptions}
        >
          {/* nicer than an emoji */}
          <div className="h-6 w-6 rounded-lg border border-slate-700 bg-slate-800/60 flex items-center justify-center">
            <span className="text-sm font-semibold text-slate-200">i</span>
          </div>
          <span className="text-sm font-medium">
            {showDescriptions ? 'Hide Descriptions' : 'Show Descriptions'}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onOpenTool(tool.id)}
            className="group text-left bg-slate-900/30 border border-slate-800/60 hover:border-slate-700 rounded-2xl p-6 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-center text-lg">
                {tool.icon}
              </div>
              <div>
                <div className="text-lg font-semibold text-white">{tool.label}</div>
                {showDescriptions && (
                  <div className="text-sm text-slate-400 mt-1">{tool.desc}</div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
