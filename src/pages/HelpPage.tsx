import { MessageCircleQuestion, FileText } from 'lucide-react';

export function HelpPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700">
        <h2 className="text-2xl font-bold text-white mb-2">Help</h2>
        <p className="text-slate-300 mb-6">
          Support resources for this workspace.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-5">
            <div className="flex items-center gap-2 text-white font-semibold mb-2">
              <MessageCircleQuestion className="w-5 h-5 text-blue-300" />
              Q&A
            </div>
            <p className="text-sm text-slate-400">Coming soon.</p>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-5">
            <div className="flex items-center gap-2 text-white font-semibold mb-2">
              <FileText className="w-5 h-5 text-blue-300" />
              Docs
            </div>
            <p className="text-sm text-slate-400">Coming soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
