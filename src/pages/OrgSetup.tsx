import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useOrg } from '../hooks/useOrg';
import { Building2, Users, ArrowLeft, LogOut } from 'lucide-react';

type Step = 'choose' | 'join' | 'create';

export function OrgSetup() {
  const { signOut } = useAuth();
  const { joinOrg, createOrg } = useOrg();
  const [step, setStep] = useState<Step>('choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [joinCode, setJoinCode] = useState('');

  const [orgName, setOrgName] = useState('');

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      setError('Please enter an organization code');
      return;
    }

    if (!/^\d{4}$/.test(joinCode.trim())) {
      setError('Organization code must be 4 digits');
      return;
    }

    setLoading(true);
    setError('');

    const result = await joinOrg(joinCode.trim());

    if (!result.success) {
      setError(result.error || 'Failed to join organization');
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!orgName.trim()) {
      setError('Please enter an organization name');
      return;
    }

    setLoading(true);
    setError('');

    const result = await createOrg(orgName.trim());

    if (!result.success) {
      setError(result.error || 'Failed to create organization');
      setLoading(false);
    }
  };

  if (step === 'choose') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <div className="absolute top-6 right-6">
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Welcome!</h1>
            <p className="text-slate-400">Let's get you set up with an organization</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <button
              onClick={() => setStep('join')}
              className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-slate-700 hover:border-blue-500 hover:bg-slate-800/70 transition-all text-left group"
            >
              <div className="w-16 h-16 bg-blue-600/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-600/30 transition-colors">
                <Users className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-2xl font-semibold text-white mb-2">Join Organization</h2>
              <p className="text-slate-400">Enter a 4-digit code to join an existing organization</p>
            </button>

            <button
              onClick={() => setStep('create')}
              className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-slate-700 hover:border-green-500 hover:bg-slate-800/70 transition-all text-left group"
            >
              <div className="w-16 h-16 bg-green-600/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-600/30 transition-colors">
                <Building2 className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-2xl font-semibold text-white mb-2">Create Organization</h2>
              <p className="text-slate-400">Start your own organization and invite others</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'join') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <div className="absolute top-6 right-6">
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
        <div className="w-full max-w-md">
          <button
            onClick={() => {
              setStep('choose');
              setError('');
            }}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-slate-700">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-600/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-2xl font-semibold text-white mb-2">Join Organization</h2>
              <p className="text-slate-400">Enter the 4-digit code from your organization</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Organization Code</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  maxLength={4}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl font-mono tracking-widest"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleJoin}
                disabled={loading || joinCode.length !== 4}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
              >
                {loading ? 'Joining...' : 'Join Organization'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="absolute top-6 right-6">
        <button
          onClick={() => signOut()}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
      <div className="w-full max-w-md">
        <button
          onClick={() => {
            setStep('choose');
            setError('');
          }}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-slate-700">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-600/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">Create Organization</h2>
            <p className="text-slate-400">Set up your new organization</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Organization Name</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="My Organization"
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={loading || !orgName.trim()}
              className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
            >
              {loading ? 'Creating...' : 'Create Organization'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
