import { useState } from 'react';
import { useOrg } from '../hooks/useOrg';
import { usePermission } from '../hooks/usePermission';
import { Building2, Copy, Users, Settings, Crown, Shield as ShieldIcon, User, RefreshCw } from 'lucide-react';

type Tab = 'overview' | 'manage';

export function OrganizationPage() {
  const { organization, members, updateOrg, regenerateCode, updateMemberRole, removeMember } = useOrg();
  const { canManageOrg } = usePermission();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState(false);

  const [editName, setEditName] = useState(organization?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [newCode, setNewCode] = useState('');

  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  const copyCode = () => {
    if (organization) {
      navigator.clipboard.writeText(organization.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setError('');

    const result = await updateOrg({
      name: editName,
    });

    if (!result.success) {
      setError(result.error || 'Failed to update organization');
    }

    setSaving(false);
  };

  const handlePromote = async (memberId: string, currentRole: string) => {
    const newRole = currentRole === 'member' ? 'admin' : 'member';
    await updateMemberRole(memberId, newRole);
  };

  const handleRemove = async () => {
    if (!memberToRemove) return;

    setRemoving(true);
    const result = await removeMember(memberToRemove.id);
    setRemoving(false);

    if (result.success) {
      setShowRemoveDialog(false);
      setMemberToRemove(null);
    }
  };

  const openRemoveDialog = (memberId: string, memberName: string) => {
    setMemberToRemove({ id: memberId, name: memberName });
    setShowRemoveDialog(true);
  };

  const handleRegenerateCode = async () => {
    setRegenerating(true);
    const result = await regenerateCode();
    setRegenerating(false);

    if (result.success && result.newCode) {
      setNewCode(result.newCode);
      setTimeout(() => {
        setShowRegenerateDialog(false);
        setNewCode('');
      }, 5000);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-4 h-4 text-yellow-400" />;
      case 'admin':
        return <ShieldIcon className="w-4 h-4 text-blue-400" />;
      default:
        return <User className="w-4 h-4 text-slate-400" />;
    }
  };

  const getRoleBadge = (role: string) => {
    const colors = {
      owner: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
      admin: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
      member: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
    };

    return (
      <span className={`px-2 py-0.5 rounded text-xs border ${colors[role as keyof typeof colors] || colors.member}`}>
        {role}
      </span>
    );
  };

  if (!organization) {
    return (
      <div className="p-8 text-center text-slate-400">
        No organization found. Please contact support.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 overflow-hidden">
        <div className="border-b border-slate-700">
          <div className="flex">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 px-6 py-4 font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'bg-slate-700/50 text-white border-b-2 border-blue-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
              }`}
            >
              <Building2 className="w-4 h-4 inline-block mr-2" />
              Overview
            </button>
            {canManageOrg() && (
              <button
                onClick={() => setActiveTab('manage')}
                className={`flex-1 px-6 py-4 font-medium transition-colors ${
                  activeTab === 'manage'
                    ? 'bg-slate-700/50 text-white border-b-2 border-blue-500'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
                }`}
              >
                <Settings className="w-4 h-4 inline-block mr-2" />
                Manage
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Organization Details</h3>
                <div className="grid gap-4">
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-slate-400 mb-1">Organization Code</div>
                        <div className="text-2xl font-mono font-bold text-white tracking-widest">
                          {organization.code}
                        </div>
                      </div>
                      <button
                        onClick={copyCode}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <Copy className="w-4 h-4" />
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <div className="text-sm text-slate-400 mb-1">Organization Name</div>
                    <div className="text-xl font-semibold text-white">{organization.name}</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Members ({members.length})
                </h3>
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="bg-slate-900/50 rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        {getRoleIcon(member.role)}
                        <div>
                          <div className="font-medium text-white">{member.display_name || 'Unknown'}</div>
                          <div className="text-sm text-slate-400">{member.email}</div>
                        </div>
                      </div>
                      {getRoleBadge(member.role)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'manage' && canManageOrg() && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Organization Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Organization Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {error && (
                    <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-400 text-sm">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleSaveSettings}
                    disabled={saving}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Security</h3>
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white mb-1">Regenerate Organization Code</div>
                      <div className="text-sm text-slate-400">
                        Generate a new 4-digit code for your organization. Current members will remain, but the old code will no longer work.
                      </div>
                    </div>
                    <button
                      onClick={() => setShowRegenerateDialog(true)}
                      className="ml-4 px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-white text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Regenerate
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Manage Members</h3>
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="bg-slate-900/50 rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        {getRoleIcon(member.role)}
                        <div>
                          <div className="font-medium text-white">{member.display_name || 'Unknown'}</div>
                          <div className="text-sm text-slate-400">{member.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getRoleBadge(member.role)}
                        {member.role !== 'owner' && (
                          <>
                            <button
                              onClick={() => handlePromote(member.id, member.role)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm font-medium transition-colors"
                            >
                              {member.role === 'admin' ? 'Demote' : 'Promote'}
                            </button>
                            <button
                              onClick={() => openRemoveDialog(member.id, member.display_name || member.email || 'this member')}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-sm font-medium transition-colors"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showRegenerateDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Regenerate Organization Code</h3>

            {newCode ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg">
                  <div className="text-sm text-green-400 mb-2">New code generated successfully!</div>
                  <div className="text-3xl font-mono font-bold text-white tracking-widest text-center">
                    {newCode}
                  </div>
                </div>
                <div className="text-sm text-slate-400">
                  This dialog will close automatically in a few seconds. Make sure to share the new code with your team.
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  <div className="p-4 bg-amber-900/20 border border-amber-700 rounded-lg">
                    <div className="text-sm text-amber-400">
                      This will generate a new 4-digit code for your organization. The current code will no longer work for new members to join.
                    </div>
                  </div>
                  <div className="text-sm text-slate-300">
                    Current members will remain in the organization. Only the join code will change.
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowRegenerateDialog(false)}
                    disabled={regenerating}
                    className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 rounded-lg text-white font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRegenerateCode}
                    disabled={regenerating}
                    className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
                  >
                    {regenerating ? 'Generating...' : 'Regenerate Code'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showRemoveDialog && memberToRemove && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Remove Member</h3>

            <div className="space-y-4 mb-6">
              <div className="p-4 bg-red-900/20 border border-red-700 rounded-lg">
                <div className="text-sm text-red-400">
                  Are you sure you want to remove <strong>{memberToRemove.name}</strong> from the organization?
                </div>
              </div>
              <div className="text-sm text-slate-300">
                This will revoke their access to all organization resources. They can rejoin later using the organization code.
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRemoveDialog(false);
                  setMemberToRemove(null);
                }}
                disabled={removing}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 rounded-lg text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
              >
                {removing ? 'Removing...' : 'Remove Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
