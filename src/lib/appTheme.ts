export type AppBackgroundTheme = 'dynamic-waves' | 'aurora-lattice';

export const APP_BACKGROUND_THEME_STORAGE_KEY = 'appBackgroundTheme';
export const APP_BACKGROUND_THEME_CHANGE_EVENT = 'app-background-theme-change';
export const DEFAULT_APP_BACKGROUND_THEME: AppBackgroundTheme = 'dynamic-waves';

export type AppBackgroundThemeOption = {
  id: AppBackgroundTheme;
  name: string;
  subtitle: string;
  status: 'stable' | 'under-development';
  previewClassName: string;
};

export const APP_BACKGROUND_THEME_OPTIONS: AppBackgroundThemeOption[] = [
  {
    id: 'dynamic-waves',
    name: 'Dynamic Waves',
    subtitle: 'Current app theme',
    status: 'stable',
    previewClassName:
      'bg-[radial-gradient(circle_at_20%_15%,rgba(99,102,241,0.45),transparent_52%),radial-gradient(circle_at_82%_75%,rgba(59,130,246,0.3),transparent_45%),linear-gradient(140deg,#05050a,#070814_40%,#060610_70%,#04040a)]',
  },
  {
    id: 'aurora-lattice',
    name: 'Aurora Lattice',
    subtitle: 'Under development',
    status: 'under-development',
    previewClassName:
      'bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.38),transparent_55%),radial-gradient(circle_at_80%_18%,rgba(56,189,248,0.3),transparent_48%),radial-gradient(circle_at_60%_75%,rgba(14,165,233,0.22),transparent_52%),linear-gradient(135deg,#031018,#05202e_40%,#032732_72%,#041015)]',
  },
];

export function isAppBackgroundTheme(value: string): value is AppBackgroundTheme {
  return APP_BACKGROUND_THEME_OPTIONS.some((theme) => theme.id === value);
}

export function getStoredAppBackgroundTheme(): AppBackgroundTheme {
  try {
    const value = localStorage.getItem(APP_BACKGROUND_THEME_STORAGE_KEY);
    if (value && isAppBackgroundTheme(value)) return value;
  } catch {}
  return DEFAULT_APP_BACKGROUND_THEME;
}

export function setStoredAppBackgroundTheme(theme: AppBackgroundTheme) {
  try {
    localStorage.setItem(APP_BACKGROUND_THEME_STORAGE_KEY, theme);
  } catch {}
  window.dispatchEvent(new CustomEvent<AppBackgroundTheme>(APP_BACKGROUND_THEME_CHANGE_EVENT, { detail: theme }));
}
