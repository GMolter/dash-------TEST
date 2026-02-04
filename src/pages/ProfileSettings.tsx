import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useOrg } from '../hooks/useOrg';
import { usePermission } from '../hooks/usePermission';
import { User, LogOut, Building2, AlertTriangle } from 'lucide-react';

export function ProfileSettings() {
  const { user, signOut } = useAuth();
  const { profile, organization, leaveOrg, deleteOrg } = useOrg();
  const { isOwner } = usePermission();
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLeave = async () => {
    if (confirmText !== organization?.name) {
      setError('Organization name does not match');
      return;
    }

    setLoading(true);
    setError('');

    const result = await leaveOrg();

    if (!result.success) {
      setError(result.error || 'Failed to leave organization');
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (confirmText !== organization?.name || !deleteChecked) {
      setError('Please complete all verification steps');
      return;
    }

    setLoading(true);
    setError('');

    const result = await deleteOrg();

    if (!result.success) {
      setError(result.error || 'Failed to delete organization');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <User className="w-6 h-6" />
            Profile Settings
          </h2>
        </div>

        <div className="border-t border-slate-700 pt-6">
          <h3 className="text-lg font-semibold text-white mb-4">Account Information</h3>
          <div className="space-y-3">
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Email</div>
              <div className="text-white">{user?.email}</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Display Name</div>
              <div className="text-white">{profile?.display_name || 'Not set'}</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Role</div>
              <div className="text-white capitalize">{profile?.role}</div>
            </div>
          </div>
        </div>

        {organization && (
          <div className="border-t border-slate-700 pt-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Organization Management
            </h3>
            <div className="space-y-4">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">Current Organization</div>
                <div className="text-white font-medium">{organization.name}</div>
              </div>

              <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-400">
                    {isOwner()
                      ? 'As the owner, deleting the organization will remove all members and delete all organization data.'
                      : 'Leaving the organization will remove your access to all organization resources.'}
                  </div>
                </div>
              </div>

              {isOwner() ? (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium transition-colors"
                >
                  Delete Organization
                </button>
              ) : (
                <button
                  onClick={() => setShowLeaveModal(true)}
                  className="w-full py-3 bg-orange-600 hover:bg-orange-700 rounded-lg text-white font-medium transition-colors"
                >
                  Leave Organization
                </button>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-slate-700 pt-6">
          <button
            onClick={() => signOut()}
            className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {showLeaveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-md w-full">
            <h3 className="text-xl font-semibold text-white mb-4">Leave Organization</h3>
            <p className="text-slate-400 mb-4">
              To confirm, please type the organization name: <strong className="text-white">{organization?.name}</strong>
            </p>

            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type organization name"
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
            />

            {error && (
              <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-400 text-sm mb-4">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowLeaveModal(false);
                  setConfirmText('');
                  setError('');
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLeave}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
              >
                {loading ? 'Leaving...' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-md w-full">
            <h3 className="text-xl font-semibold text-white mb-4">Delete Organization</h3>

            <div className="mb-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteChecked}
                  onChange={(e) => setDeleteChecked(e.target.checked)}
                  className="mt-1"
                />
                <span className="text-slate-300 text-sm">
                  I understand this will delete the organization and all its data, and remove all current members.
                </span>
              </label>
            </div>

            <p className="text-slate-400 mb-4">
              To confirm, please type the organization name: <strong className="text-white">{organization?.name}</strong>
            </p>

            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type organization name"
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />

            {error && (
              <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-400 text-sm mb-4">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setConfirmText('');
                  setDeleteChecked(false);
                  setError('');
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
