import { lazy, useState, useEffect } from 'react';
import { AnimatedBackground } from './components/AnimatedBackground';
import { Quicklinks } from './components/Quicklinks';
import { DashboardTodosHomeHeader } from './components/DashboardTodos';
import { ClassDashWidget } from './components/ClassDashWidget';
import { DashboardShortcuts } from './components/DashboardShortcuts';
import { AppNavigation } from './components/AppNavigation';
import { useAuth } from './hooks/useAuth';
import { useOrg } from './hooks/useOrg';
import {
  APP_BACKGROUND_THEME_PRESETS_CHANGE_EVENT,
  APP_BACKGROUND_THEME_PRESETS_STORAGE_KEY,
  APP_BACKGROUND_THEME_STORAGE_KEY,
  APP_BACKGROUND_THEME_CHANGE_EVENT,
  AppBackgroundThemePresetMap,
  AppBackgroundTheme,
  getStoredAppBackgroundThemePresets,
  getStoredAppBackgroundTheme,
  isAppBackgroundTheme,
  normalizeAppBackgroundThemePresets,
  setStoredAppBackgroundThemePreset,
  setStoredAppBackgroundTheme,
} from './lib/appTheme';
import { AlertTriangle } from 'lucide-react';
import { useDashboardConfiguration } from './hooks/useDashboardConfiguration';
import {
  launcherAuthorizationAccess,
  parseLauncherAuthorizationLocation,
} from './features/launcherDevices/authorizationRoute';

const URLShortener = lazy(() => import('./components/URLShortener').then(({ URLShortener: Component }) => ({ default: Component })));
const SecretSharing = lazy(() => import('./components/SecretSharing').then(({ SecretSharing: Component }) => ({ default: Component })));
const QRCodeGenerator = lazy(() => import('./components/QRCodeGenerator').then(({ QRCodeGenerator: Component }) => ({ default: Component })));
const Pastebin = lazy(() => import('./components/Pastebin').then(({ Pastebin: Component }) => ({ default: Component })));
const QuickPastes = lazy(() => import('./components/QuickPastes').then(({ QuickPastes: Component }) => ({ default: Component })));
const UtilitiesHub = lazy(() => import('./components/UtilitiesHub').then(({ UtilitiesHub: Component }) => ({ default: Component })));
const URLRedirect = lazy(() => import('./pages/URLRedirect').then(({ URLRedirect: Component }) => ({ default: Component })));
const SecretView = lazy(() => import('./pages/SecretView').then(({ SecretView: Component }) => ({ default: Component })));
const PasteView = lazy(() => import('./pages/PasteView').then(({ PasteView: Component }) => ({ default: Component })));
const PasteList = lazy(() => import('./pages/PasteList').then(({ PasteList: Component }) => ({ default: Component })));
const NotFound = lazy(() => import('./pages/NotFound').then(({ NotFound: Component }) => ({ default: Component })));
const Admin = lazy(() => import('./pages/Admin'));
const ProjectsCenterApp = lazy(() => import('./pages/ProjectsCenterApp').then(({ ProjectsCenterApp: Component }) => ({ default: Component })));
const ProjectDashboard = lazy(() => import('./pages/ProjectDashboard').then(({ ProjectDashboard: Component }) => ({ default: Component })));
const Onboarding = lazy(() => import('./pages/Onboarding').then(({ Onboarding: Component }) => ({ default: Component })));
const OrgSetup = lazy(() => import('./pages/OrgSetup').then(({ OrgSetup: Component }) => ({ default: Component })));
const OrganizationPage = lazy(() => import('./pages/OrganizationPage').then(({ OrganizationPage: Component }) => ({ default: Component })));
const ProfileSettings = lazy(() => import('./pages/ProfileSettings').then(({ ProfileSettings: Component }) => ({ default: Component })));
const HelpPage = lazy(() => import('./pages/HelpPage').then(({ HelpPage: Component }) => ({ default: Component })));
const HelpArticlePage = lazy(() => import('./pages/HelpArticlePage').then(({ HelpArticlePage: Component }) => ({ default: Component })));
const LauncherAuthorization = lazy(() => import('./pages/LauncherAuthorization').then(({ LauncherAuthorization: Component }) => ({ default: Component })));
const ClassDashPage = lazy(() => import('./pages/ClassDashPage').then(({ ClassDashPage: Component }) => ({ default: Component })));
const PluginManager = lazy(() => import('./components/PluginManager').then(({ PluginManager: Component }) => ({ default: Component })));

type View =
  | { type: 'home' }
  | { type: 'utilities' }
  | { type: 'admin' }
  | { type: 'admin-editor' }
  | { type: 'organization' }
  | { type: 'profile' }
  | { type: 'help' }
  | { type: 'help-article'; slug: string }
  | { type: 'classdash' }
  | { type: 'tool'; tool: string }
  | { type: 'redirect'; code: string }
  | { type: 'secret'; code: string }
  | { type: 'paste'; code: string }
  | { type: 'paste-list' }
  | { type: 'projects-center' }
  | { type: 'project-dashboard'; id: string }
  | { type: 'launcher-authorization'; requestId: string; displayCode: string };

type BannerState = { enabled: boolean; text: string };
const BANNER_CACHE_KEY = 'olio-public-banner-v1';

function readBannerCache(): BannerState {
  try {
    const cached = window.localStorage.getItem(BANNER_CACHE_KEY);
    if (!cached) return { enabled: false, text: '' };
    const parsed = JSON.parse(cached) as BannerState;
    return {
      enabled: parsed.enabled === true,
      text: typeof parsed.text === 'string' ? parsed.text : '',
    };
  } catch {
    return { enabled: false, text: '' };
  }
}

function writeBannerCache(banner: BannerState) {
  try {
    window.localStorage.setItem(BANNER_CACHE_KEY, JSON.stringify(banner));
  } catch {
    // Storage can be unavailable in hardened/private browsing modes.
  }
}

function App() {
  const { user, loading: authLoading } = useAuth();
  const { profile, organization } = useOrg();
  const { modules: dashboardModules } = useDashboardConfiguration();

  const [view, setView] = useState<View>({ type: 'home' });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [banner, setBanner] = useState<BannerState>(readBannerCache);
  const [allowOnboarding, setAllowOnboarding] = useState(false);
  const [appBackgroundTheme, setAppBackgroundTheme] = useState<AppBackgroundTheme>(() => getStoredAppBackgroundTheme());
  const [appBackgroundThemePresets, setAppBackgroundThemePresets] = useState<AppBackgroundThemePresetMap>(() => getStoredAppBackgroundThemePresets());
  const appBackgroundPreset = appBackgroundThemePresets[appBackgroundTheme];

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (authLoading || user) {
      setAllowOnboarding(false);
      return;
    }

    const timeout = window.setTimeout(() => setAllowOnboarding(true), 350);
    return () => clearTimeout(timeout);
  }, [authLoading, user]);

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<AppBackgroundTheme>;
      if (isAppBackgroundTheme(customEvent.detail)) {
        setAppBackgroundTheme(customEvent.detail);
      }
    };

    const onThemePresetsChange = (event: Event) => {
      const customEvent = event as CustomEvent<AppBackgroundThemePresetMap>;
      setAppBackgroundThemePresets(normalizeAppBackgroundThemePresets(customEvent.detail));
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;

      if (event.key === APP_BACKGROUND_THEME_STORAGE_KEY) {
        if (event.newValue && isAppBackgroundTheme(event.newValue)) {
          setAppBackgroundTheme(event.newValue);
          return;
        }
        setAppBackgroundTheme(getStoredAppBackgroundTheme());
      }

      if (event.key === APP_BACKGROUND_THEME_PRESETS_STORAGE_KEY) {
        setAppBackgroundThemePresets(getStoredAppBackgroundThemePresets());
        return;
      }
    };

    window.addEventListener(APP_BACKGROUND_THEME_CHANGE_EVENT, onThemeChange as EventListener);
    window.addEventListener(APP_BACKGROUND_THEME_PRESETS_CHANGE_EVENT, onThemePresetsChange as EventListener);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener(APP_BACKGROUND_THEME_CHANGE_EVENT, onThemeChange as EventListener);
      window.removeEventListener(APP_BACKGROUND_THEME_PRESETS_CHANGE_EVENT, onThemePresetsChange as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBanner() {
      try {
        const r = await fetch('/api/public/settings');
        const j = await r.json();
        if (cancelled) return;

        const nextBanner = {
          enabled: !!j.bannerEnabled,
          text: j.bannerText || '',
        };
        setBanner(nextBanner);
        writeBannerCache(nextBanner);
      } catch {
        if (cancelled) return;
        setBanner({ enabled: false, text: '' });
      }
    }

    loadBanner();

    const onVis = () => {
      if (document.visibilityState === 'visible') loadBanner();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    const resolve = () => {
      const path = window.location.pathname || '/';
      const cleanPath = path.replace(/\/+$/, '') || '/';

      const launcherAuthorization = parseLauncherAuthorizationLocation(cleanPath, window.location.search);
      if (launcherAuthorization) {
        setView({
          type: 'launcher-authorization',
          requestId: launcherAuthorization.requestId,
          displayCode: launcherAuthorization.displayCode,
        });
        return;
      }

      if (cleanPath === '/projects') {
        setView({ type: 'projects-center' });
        return;
      }
      if (cleanPath.startsWith('/projects/')) {
        const id = cleanPath.replace('/projects/', '').split('/')[0];
        if (id) setView({ type: 'project-dashboard', id });
        else setView({ type: 'projects-center' });
        return;
      }

      if (cleanPath === '/admin') {
        setView({ type: 'admin' });
        if (window.location.pathname !== '/') window.history.replaceState({}, '', '/');
        return;
      }
      if (cleanPath === '/admin/editor') {
        setView({ type: 'admin-editor' });
        return;
      }

      if (cleanPath === '/organization') {
        setView({ type: 'organization' });
        if (window.location.pathname !== '/') window.history.replaceState({}, '', '/');
        return;
      }

      if (cleanPath === '/profile') {
        setView({ type: 'profile' });
        if (window.location.pathname !== '/') window.history.replaceState({}, '', '/');
        return;
      }

      if (cleanPath === '/help') {
        setView({ type: 'help' });
        return;
      }
      if (cleanPath.startsWith('/help/article/')) {
        const slug = cleanPath.replace('/help/article/', '').split('/')[0];
        if (slug) setView({ type: 'help-article', slug });
        else setView({ type: 'tool', tool: 'notfound' });
        return;
      }

      if (cleanPath === '/utilities') {
        setView({ type: 'utilities' });
        if (window.location.pathname !== '/') window.history.replaceState({}, '', '/');
        return;
      }

      if (cleanPath === '/classdash') {
        setView({ type: 'classdash' });
        return;
      }

      if (cleanPath === '/p' || cleanPath === '/pastes') {
        setView({ type: 'paste-list' });
        if (window.location.pathname !== '/') window.history.replaceState({}, '', '/');
        return;
      }

      if (cleanPath.startsWith('/s/')) {
        const code = cleanPath.replace('/s/', '').split('/')[0];
        if (code) setView({ type: 'secret', code });
        else setView({ type: 'tool', tool: 'notfound' });
        return;
      }

      if (cleanPath.startsWith('/secret/')) {
        const code = cleanPath.replace('/secret/', '').split('/')[0];
        if (code) setView({ type: 'secret', code });
        else setView({ type: 'tool', tool: 'notfound' });
        return;
      }

      if (cleanPath.startsWith('/p/')) {
        const code = cleanPath.replace('/p/', '').split('/')[0];
        if (code) setView({ type: 'paste', code });
        else setView({ type: 'tool', tool: 'notfound' });
        return;
      }

      if (cleanPath.startsWith('/paste/')) {
        const code = cleanPath.replace('/paste/', '').split('/')[0];
        if (code) setView({ type: 'paste', code });
        else setView({ type: 'tool', tool: 'notfound' });
        return;
      }

      const maybeCode = cleanPath.replace(/^\//, '');
      if (maybeCode && !['home', 'admin', 'utilities', 'p', 'pastes', 'projects', 'organization', 'profile', 'help'].includes(maybeCode)) {
        setView({ type: 'redirect', code: maybeCode });
        return;
      }

      setView({ type: 'home' });
    };

    resolve();

    window.addEventListener('popstate', resolve);
    return () => window.removeEventListener('popstate', resolve);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const utilities = [
    { id: 'quicklinks', label: 'Quick Links', icon: '🔗', desc: 'Manage bookmarks' },
    { id: 'projects', label: 'Projects', icon: '📁', desc: 'Track your work' },
    { id: 'triggers', label: 'Help Center', icon: '📚', desc: 'Browse docs and guides' },
    { id: 'shortener', label: 'URL Shortener', icon: '✂️', desc: 'Shorten URLs' },
    { id: 'secrets', label: 'Secret Sharing', icon: '🔒', desc: 'One-time links' },
    { id: 'qr', label: 'QR Generator', icon: '📱', desc: 'Generate QR codes' },
    { id: 'quick-pastes', label: 'Quick Pastes', icon: '📋', desc: 'Manage private reusable text' },
    { id: 'pastebin', label: 'Pastebin', icon: '📝', desc: 'Share code/text' },
    { id: 'plugins', label: 'Plugins & Dashboard', icon: '🧩', desc: 'Install modules and customize Home' },
  ];

  const renderHome = () => {
    const enabled = new Set(dashboardModules.filter((module) => module.enabled && module.available).map((module) => module.id));
    const orderedContentModules = dashboardModules.filter((module) => module.enabled && module.available && module.id !== 'tasks');
    return (
    <div className="mx-auto min-h-screen w-full max-w-[88rem] px-5 pb-16 sm:px-8 lg:px-12">
      {enabled.has('tasks') && <DashboardTodosHomeHeader />}
      <section className="mx-auto max-w-4xl pt-24 text-center md:pt-6 lg:pt-5">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white drop-shadow-[0_5px_28px_rgba(255,255,255,0.12)] sm:text-4xl lg:text-4xl">
          Olio Workstation
        </h1>
        <p className="mt-3 text-sm text-slate-300 sm:text-lg lg:text-xl">
          {getGreeting()}
          <span className="mx-2 text-violet-400">•</span>
          {formatDate(currentTime)}
          <span className="mx-2 text-violet-400">•</span>
          <span className="font-mono text-slate-200">{formatTime(currentTime)}</span>
        </p>
        <div className="mx-auto mt-4 h-px w-14 bg-gradient-to-r from-transparent via-violet-400 to-transparent shadow-[0_0_14px_rgba(139,92,246,0.9)]" />
      </section>

      {banner.enabled && banner.text?.trim() && (
        <div className="mx-auto mt-9 max-w-4xl rounded-3xl border border-amber-300/20 bg-amber-400/[0.09] px-5 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_65px_rgba(2,6,23,0.3)] backdrop-blur-xl sm:px-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10">
              <AlertTriangle className="h-5 w-5 text-amber-200" />
            </div>
            <div className="pt-2 text-sm leading-relaxed text-amber-100 sm:text-base">{banner.text}</div>
          </div>
        </div>
      )}

      <div className="mt-7 space-y-6 sm:mt-8 lg:mt-8">
        {orderedContentModules.map((module) => {
          if (module.id === 'classdash') return <ClassDashWidget key={module.id} onOpen={() => navigateTo('/classdash')} />;
          if (module.id === 'quicklinks') return <section key={module.id} aria-label="Quick Links"><Quicklinks editMode={false} /></section>;
          if (module.id === 'shortcuts') return <DashboardShortcuts key={module.id} onNavigate={navigateTo} onOpenTool={(tool) => setView({ type: 'tool', tool })} />;
          return null;
        })}
      </div>
    </div>
    );
  };

  const renderUtilities = () => {
    if (view.type === 'tool') {
      return (
        <div className="space-y-6">
          <button
            onClick={() => setView({ type: 'utilities' })}
            className="text-slate-300 hover:text-white flex items-center gap-2"
          >
            ← Back to Utilities
          </button>

          {view.tool === 'quicklinks' && <Quicklinks editMode={true} />}
          {view.tool === 'shortener' && <URLShortener />}
          {view.tool === 'secrets' && <SecretSharing />}
          {view.tool === 'qr' && <QRCodeGenerator />}
          {view.tool === 'quick-pastes' && <QuickPastes />}
          {view.tool === 'pastebin' && <Pastebin />}
          {view.tool === 'plugins' && <PluginManager onNavigate={navigateTo} />}
        </div>
      );
    }

    return (
      <UtilitiesHub
        tools={utilities}
        onOpenTool={(toolId) => {
          if (toolId === 'projects') {
            navigateTo('/projects');
          } else if (toolId === 'triggers') {
            navigateTo('/help');
          } else {
            setView({ type: 'tool', tool: toolId });
          }
        }}
      />
    );
  };

  const isPublicRoute = view.type === 'redirect' || view.type === 'secret' || view.type === 'paste' || view.type === 'paste-list';

  const currentNavigationPath = (() => {
    if (view.type === 'home') return '/';
    if (view.type === 'utilities' || view.type === 'tool') return '/utilities';
    if (view.type === 'projects-center' || view.type === 'project-dashboard') return '/utilities';
    if (view.type === 'organization') return '/organization';
    if (view.type === 'profile') return '/profile';
    if (view.type === 'help') return '/help';
    if (view.type === 'help-article') return `/help/article/${view.slug}`;
    if (view.type === 'classdash') return '/classdash';
    return window.location.pathname || '/';
  })();

  const floatingNavigation = user ? (
    <AppNavigation
      currentPath={currentNavigationPath}
      organizationName={organization?.name}
      onNavigate={navigateTo}
    />
  ) : null;

  if (view.type === 'launcher-authorization') {
    const access = launcherAuthorizationAccess(authLoading, !!user, allowOnboarding);
    if (access === 'loading') {
      return <div className="min-h-screen bg-slate-950" role="status" aria-label="Checking sign-in status" />;
    }
    if (access === 'sign-in') return <Onboarding />;
    return <LauncherAuthorization requestId={view.requestId} displayCode={view.displayCode} />;
  }

  if (view.type === 'projects-center') {
    return (
      <>
        {floatingNavigation}
        <ProjectsCenterApp
          onOpenProject={(id) => navigateTo(`/projects/${id}`)}
          backgroundTheme={appBackgroundTheme}
          backgroundPreset={appBackgroundPreset}
        />
      </>
    );
  }

  if (view.type === 'project-dashboard') {
    return (
      <>
        {floatingNavigation}
        <ProjectDashboard
          projectId={view.id}
          backgroundTheme={appBackgroundTheme}
          backgroundPreset={appBackgroundPreset}
        />
      </>
    );
  }

  if (view.type === 'help') {
    return (
      <>
        <AnimatedBackground theme={appBackgroundTheme} preset={appBackgroundPreset} />
        {floatingNavigation}
        <div className="relative z-10"><HelpPage /></div>
      </>
    );
  }

  if (view.type === 'help-article') {
    return (
      <>
        <AnimatedBackground theme={appBackgroundTheme} preset={appBackgroundPreset} />
        {floatingNavigation}
        <div className="relative z-10"><HelpArticlePage slug={view.slug} /></div>
      </>
    );
  }

  if (view.type === 'admin-editor') {
    return (
      <>
        {floatingNavigation}
        <Admin editorOnly />
      </>
    );
  }

  if (isPublicRoute) {
    return (
      <>
        {view.type === 'redirect' && <URLRedirect shortCode={view.code} />}
        {view.type === 'secret' && <SecretView secretCode={view.code} />}
        {view.type === 'paste' && <PasteView pasteCode={view.code} />}
        {view.type === 'paste-list' && <PasteList />}
      </>
    );
  }

  if (!user && allowOnboarding) {
    return <Onboarding />;
  }

  if (user && !authLoading && profile && !profile.org_id) {
    return <OrgSetup />;
  }

  return (
    <div className="min-h-screen text-white relative">
      <AnimatedBackground theme={appBackgroundTheme} preset={appBackgroundPreset} />
      {floatingNavigation}
      <div className="relative z-10 min-h-screen flex flex-col">
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <main className={view.type === 'home' ? 'flex-1' : 'glass-page-offset flex-1 p-4 sm:p-6 lg:p-10'}>
            {view.type === 'home' && renderHome()}
            {view.type === 'utilities' && renderUtilities()}
            {view.type === 'tool' && renderUtilities()}
            {view.type === 'organization' && <OrganizationPage />}
            {view.type === 'profile' && (
              <ProfileSettings
                appBackgroundTheme={appBackgroundTheme}
                appBackgroundPreset={appBackgroundPreset}
                getPresetForTheme={(theme) => appBackgroundThemePresets[theme]}
                onAppBackgroundThemeChange={(theme) => {
                  setAppBackgroundTheme(theme);
                  setStoredAppBackgroundTheme(theme);
                }}
                onAppBackgroundPresetChange={(theme, preset) => {
                  setAppBackgroundThemePresets((prev) => ({ ...prev, [theme]: preset }));
                  setStoredAppBackgroundThemePreset(theme, preset);
                }}
              />
            )}
            {view.type === 'classdash' && <ClassDashPage />}
            {view.type === 'admin' && <Admin />}
            {view.type === 'tool' && view.tool === 'notfound' && <NotFound />}
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;

function navigateTo(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
