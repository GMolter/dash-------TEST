import { useState, useEffect } from 'react';
import { AnimatedBackground } from './components/AnimatedBackground';
import { Quicklinks } from './components/Quicklinks';
import { Triggers } from './components/Triggers';
import { URLShortener } from './components/URLShortener';
import { SecretSharing } from './components/SecretSharing';
import { QRCodeGenerator } from './components/QRCodeGenerator';
import { Pastebin } from './components/Pastebin';
import { URLRedirect } from './pages/URLRedirect';
import { SecretView } from './pages/SecretView';
import { PasteView } from './pages/PasteView';
import { PasteList } from './pages/PasteList';
import { NotFound } from './pages/NotFound';
import Admin from './pages/Admin';
import { UtilitiesHub } from './components/UtilitiesHub';
import { ProjectsCenterApp } from './pages/ProjectsCenterApp';
import { ProjectDashboard } from './pages/ProjectDashboard';
import { Onboarding } from './pages/Onboarding';
import { OrgSetup } from './pages/OrgSetup';
import { OrganizationPage } from './pages/OrganizationPage';
import { ProfileSettings } from './pages/ProfileSettings';
import { useAuth } from './hooks/useAuth';
import { useOrg } from './hooks/useOrg';
import { Home, Wrench, Menu, X, AlertTriangle, Building2, UserCircle } from 'lucide-react';

type View =
  | { type: 'home' }
  | { type: 'utilities' }
  | { type: 'admin' }
  | { type: 'organization' }
  | { type: 'profile' }
  | { type: 'tool'; tool: string }
  | { type: 'redirect'; code: string }
  | { type: 'secret'; code: string }
  | { type: 'paste'; code: string }
  | { type: 'paste-list' }
  | { type: 'projects-center' }
  | { type: 'project-dashboard'; id: string };

type BannerState = { enabled: boolean; text: string };

function App() {
  const { user, loading: authLoading } = useAuth();
  const { profile, organization, loading: orgLoading } = useOrg();

  const [view, setView] = useState<View>({ type: 'home' });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebarOpen');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const [currentTime, setCurrentTime] = useState(new Date());
  const [banner, setBanner] = useState<BannerState>({ enabled: false, text: '' });

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('sidebarOpen', String(sidebarOpen));
    } catch {}
  }, [sidebarOpen]);

  useEffect(() => {
    let cancelled = false;

    async function loadBanner() {
      try {
        const r = await fetch('/api/public/settings');
        const j = await r.json();
        if (cancelled) return;

        setBanner({
          enabled: !!j.bannerEnabled,
          text: j.bannerText || '',
        });
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

      if (cleanPath === '/utilities') {
        setView({ type: 'utilities' });
        if (window.location.pathname !== '/') window.history.replaceState({}, '', '/');
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
      if (maybeCode && !['home', 'admin', 'utilities', 'p', 'pastes', 'projects', 'organization', 'profile'].includes(maybeCode)) {
        setView({ type: 'redirect', code: maybeCode });
        return;
      }

      setView({ type: 'home' });
    };

    resolve();

    window.addEventListener('popstate', resolve);
    return () => window.removeEventListener('popstate', resolve);
  }, []);

  const toggleSidebar = () => setSidebarOpen((v) => !v);

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
    { id: 'triggers', label: 'Triggers', icon: '⚡', desc: 'Run webhooks' },
    { id: 'shortener', label: 'URL Shortener', icon: '✂️', desc: 'Shorten URLs' },
    { id: 'secrets', label: 'Secret Sharing', icon: '🔒', desc: 'One-time links' },
    { id: 'qr', label: 'QR Generator', icon: '📱', desc: 'Generate QR codes' },
    { id: 'pastebin', label: 'Pastebin', icon: '📝', desc: 'Share code/text' },
  ];

  const navItems = [
    { id: 'home', label: 'Home', icon: <Home className="w-5 h-5" />, view: { type: 'home' as const } },
    { id: 'utilities', label: 'Utilities', icon: <Wrench className="w-5 h-5" />, view: { type: 'utilities' as const } },
    { id: 'organization', label: 'Organization', icon: <Building2 className="w-5 h-5" />, view: { type: 'organization' as const } },
    { id: 'profile', label: 'Profile', icon: <UserCircle className="w-5 h-5" />, view: { type: 'profile' as const } },
  ];

  const renderHome = () => (
    <div className="w-full">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-semibold text-indigo-300">Quick Links</h2>
      </div>
      <Quicklinks editMode={false} />
    </div>
  );

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
          {view.tool === 'triggers' && <Triggers />}
          {view.tool === 'shortener' && <URLShortener />}
          {view.tool === 'secrets' && <SecretSharing />}
          {view.tool === 'qr' && <QRCodeGenerator />}
          {view.tool === 'pastebin' && <Pastebin />}
        </div>
      );
    }

    return (
      <UtilitiesHub
        tools={utilities}
        onOpenTool={(toolId) => {
          if (toolId === 'projects') {
            navigateTo('/projects');
          } else {
            setView({ type: 'tool', tool: toolId });
          }
        }}
      />
    );
  };

  const isPublicRoute = view.type === 'redirect' || view.type === 'secret' || view.type === 'paste' || view.type === 'paste-list';

  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (view.type === 'projects-center') {
    return <ProjectsCenterApp onOpenProject={(id) => navigateTo(`/projects/${id}`)} />;
  }

  if (view.type === 'project-dashboard') {
    return <ProjectDashboard projectId={view.id} />;
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

  if (!user) {
    return <Onboarding />;
  }

  if (!profile?.org_id) {
    return <OrgSetup />;
  }

  return (
    <div className="h-screen text-white relative overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 h-full flex flex-col">
        <header className="relative z-20 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur">
          <div className="px-10 py-7 flex items-start justify-between">
            <div className="flex items-start gap-8">
              <button
                onClick={toggleSidebar}
                className="p-4 hover:bg-slate-800/50 bg-slate-900/30 border border-slate-800/60 rounded-2xl transition-colors"
                aria-label="Toggle menu"
              >
                {sidebarOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
              </button>

              <div className="pt-1">
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
                  Olio Workstation
                </h1>

                <p className="mt-4 text-lg md:text-xl text-slate-300">
                  {getGreeting()} · {formatDate(currentTime)} ·{' '}
                  <span className="font-mono text-slate-200">{formatTime(currentTime)}</span>
                </p>

                {organization && (
                  <div className="mt-2 text-sm text-slate-400">
                    {organization.name}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {banner.enabled && banner.text?.trim() && (
          <div className="relative z-20 px-10 pt-5">
            <div className="rounded-3xl border border-amber-500/25 bg-amber-500/12 backdrop-blur px-6 py-5 flex items-start gap-4">
              <div className="h-11 w-11 rounded-2xl border border-amber-500/25 bg-amber-500/12 flex items-center justify-center flex-none">
                <AlertTriangle className="w-5 h-5 text-amber-200" />
              </div>
              <div className="text-base md:text-lg text-amber-100 leading-snug">
                {banner.text}
              </div>
            </div>
          </div>
        )}

        <div className="relative z-10 flex flex-1 min-h-0">
          {sidebarOpen && (
            <aside className="w-72 border-r border-slate-800/50 bg-slate-950/40 backdrop-blur">
              <nav className="p-5 space-y-3">
                {navItems.map((item) => {
                  const active =
                    (view.type === 'home' && item.id === 'home') ||
                    (view.type === 'utilities' && item.id === 'utilities') ||
                    (view.type === 'organization' && item.id === 'organization') ||
                    (view.type === 'profile' && item.id === 'profile') ||
                    (view.type === 'tool' && item.id === 'utilities');

                  return (
                    <button
                      key={item.id}
                      onClick={() => setView(item.view)}
                      className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-colors ${
                        active
                          ? 'bg-blue-500/20 border border-blue-500/30 text-blue-200'
                          : 'hover:bg-slate-800/40 text-slate-200'
                      }`}
                    >
                      {item.icon}
                      <span className="text-base font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>
          )}

          <main className="flex-1 p-10 overflow-y-auto">
            {view.type === 'home' && renderHome()}
            {view.type === 'utilities' && renderUtilities()}
            {view.type === 'tool' && renderUtilities()}
            {view.type === 'organization' && <OrganizationPage />}
            {view.type === 'profile' && <ProfileSettings />}
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
