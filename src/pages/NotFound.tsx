import { AlertTriangle, Home } from 'lucide-react';

export function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700">
          <AlertTriangle className="w-20 h-20 text-yellow-500 mx-auto mb-6" />
          
          <h1 className="text-6xl font-bold text-white mb-2">404</h1>
          <h2 className="text-2xl font-semibold text-slate-300 mb-4">Page Not Found</h2>
          
          <p className="text-slate-400 mb-8">
            The page you're looking for doesn't exist or may have been moved.
          </p>

          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors"
          >
            <Home className="w-5 h-5" />
            Back to Safety
          </a>
        </div>

        <p className="text-slate-500 text-sm mt-6">
          Lost? Our dashboard is just a click away.
        </p>
      </div>
    </div>
  );
}
