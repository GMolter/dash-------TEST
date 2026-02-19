import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useOrg } from '../hooks/useOrg';
import { usePermission } from '../hooks/usePermission';
import {
  APP_BACKGROUND_PRESET_OPTIONS,
  APP_BACKGROUND_THEME_OPTIONS,
  AppBackgroundPreset,
  AppBackgroundTheme,
} from '../lib/appTheme';
import { User, LogOut, Building2, AlertTriangle, ExternalLink, Palette, X } from 'lucide-react';
import { AnimatedBackground } from '../components/AnimatedBackground';

type ProfileSettingsProps = {
  appBackgroundTheme: AppBackgroundTheme;
  appBackgroundPreset: AppBackgroundPreset;
  onAppBackgroundThemeChange: (theme: AppBackgroundTheme) => void;
  onAppBackgroundPresetChange: (preset: AppBackgroundPreset) => void;
};

export function ProfileSettings({
  appBackgroundTheme,
  appBackgroundPreset,
  onAppBackgroundThemeChange,
  onAppBackgroundPresetChange,
}: ProfileSettingsProps) {
  const { user, signOut } = useAuth();
  const { profile, organization, leaveOrg, deleteOrg } = useOrg();
  const { isOwner } = usePermission();
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<AppBackgroundTheme>(appBackgroundTheme);
  const [previewPreset, setPreviewPreset] = useState<AppBackgroundPreset>(appBackgroundPreset);

  const activeThemeOption =
    APP_BACKGROUND_THEME_OPTIONS.find((theme) => theme.id === appBackgroundTheme) ??
    APP_BACKGROUND_THEME_OPTIONS[0];
  const activePresetOption =
    APP_BACKGROUND_PRESET_OPTIONS.find((preset) => preset.id === appBackgroundPreset) ??
    APP_BACKGROUND_PRESET_OPTIONS[0];
  const previewThemeOption =
    APP_BACKGROUND_THEME_OPTIONS.find((theme) => theme.id === previewTheme) ?? APP_BACKGROUND_THEME_OPTIONS[0];

  useEffect(() => {
    if (!showThemeModal) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowThemeModal(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showThemeModal]);

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
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
            <User className="w-6 h-6" />
            Profile Settings
          </h2>
          <a
            href="/help"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-900/40 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800/60 hover:text-white transition-colors"
          >
            Help
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        <div className="border-t border-slate-700 pt-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Palette className="w-5 h-5" />
            App Background
          </h3>
          <div className="bg-slate-900/50 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-sm text-slate-400 mb-1">Current Theme</div>
              <div className="text-white font-medium">{activeThemeOption.name}</div>
              <div className="text-xs text-slate-400 mt-1">Preset: {activePresetOption.name}</div>
            </div>
            <button
              onClick={() => {
                setPreviewTheme(appBackgroundTheme);
                setPreviewPreset(appBackgroundPreset);
                setShowThemeModal(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium transition-colors"
            >
              Customize
            </button>
          </div>
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

      {showThemeModal && (
        <div
          className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6"
          onClick={() => setShowThemeModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="customize-background-title"
        >
          <div
            className="bg-slate-900 rounded-2xl border border-slate-700 max-w-6xl w-full p-4 sm:p-6 space-y-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 id="customize-background-title" className="text-xl sm:text-2xl font-semibold text-white">
                Customize App Background
              </h3>
              <button
                onClick={() => setShowThemeModal(false)}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                aria-label="Close customize app background modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr,1fr] gap-6 min-h-[360px]">
              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
                <div className="relative h-full min-h-[320px] rounded-lg border border-slate-600/70 overflow-hidden">
                  <AnimatedBackground
                    theme={previewTheme}
                    preset={previewPreset}
                    fixed={false}
                    className="absolute inset-0"
                  />
                  <div className="relative h-full w-full bg-[linear-gradient(120deg,rgba(15,23,42,0.16),rgba(255,255,255,0.01))] rounded-lg p-6 flex flex-col justify-between pointer-events-none">
                    <div className="h-9 w-44 rounded-lg border border-white/10 bg-black/20" />
                    <div className="space-y-3">
                      <div className="h-5 w-40 rounded bg-white/10" />
                      <div className="h-4 w-56 rounded bg-white/10" />
                      <div className="h-4 w-48 rounded bg-white/10" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-5 flex flex-col">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Theme</div>
                  <h4 className="text-2xl font-semibold text-white">{previewThemeOption.name}</h4>
                  <p className="text-slate-300 mt-3">{previewThemeOption.subtitle}</p>
                  {previewThemeOption.status === 'under-development' && (
                    <div className="inline-flex mt-4 px-3 py-1 rounded-full border border-amber-500/40 bg-amber-600/15 text-amber-200 text-xs uppercase tracking-wide">
                      Under development
                    </div>
                  )}
                </div>

                <div className="mt-7">
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-3">Color Presets</div>
                  <div className="grid grid-cols-2 gap-3">
                    {APP_BACKGROUND_PRESET_OPTIONS.map((preset) => {
                      const selected = previewPreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => setPreviewPreset(preset.id)}
                          className={`rounded-lg border p-1 transition-colors ${
                            selected
                              ? 'border-blue-400 shadow-md shadow-blue-950/30'
                              : 'border-slate-700 hover:border-slate-500'
                          }`}
                          aria-pressed={selected}
                        >
                          <div className={`h-10 rounded ${preset.swatchClassName}`} />
                          <div className="text-sm text-slate-200 mt-2">{preset.name}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-8">
                  <button
                    onClick={() => {
                      onAppBackgroundThemeChange(previewTheme);
                      onAppBackgroundPresetChange(previewPreset);
                    }}
                    disabled={previewTheme === appBackgroundTheme && previewPreset === appBackgroundPreset}
                    className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors ${
                      previewTheme === appBackgroundTheme && previewPreset === appBackgroundPreset
                        ? 'bg-emerald-600/40 border border-emerald-500/50 text-emerald-200 cursor-default'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {previewTheme === appBackgroundTheme && previewPreset === appBackgroundPreset ? 'Selected' : 'Select'}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {APP_BACKGROUND_THEME_OPTIONS.map((theme) => {
                const isPreview = previewTheme === theme.id;
                const isActive = appBackgroundTheme === theme.id;

                return (
                  <button
                    key={theme.id}
                    onClick={() => setPreviewTheme(theme.id)}
                    className={`group rounded-xl border text-left transition-all overflow-hidden ${
                      isPreview
                        ? 'border-blue-400 shadow-lg shadow-blue-950/40 scale-[1.02]'
                        : 'border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <div className="relative h-28">
                      <AnimatedBackground
                        theme={theme.id}
                        preset={previewPreset}
                        fixed={false}
                        className="absolute inset-0"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(15,23,42,0.18),rgba(255,255,255,0))]" />
                    </div>
                    <div className="p-4 bg-slate-900/90">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-white">{theme.name}</div>
                        {isActive && (
                          <span className="text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/50 text-emerald-200">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-400 mt-1">{theme.subtitle}</div>
                    </div>
                  </button>
                );
              })}
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
