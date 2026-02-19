export type AppBackgroundTheme = 'dynamic-waves' | 'contour-drift' | 'aurora-lattice';
export type AppBackgroundPreset = 'indigo' | 'ocean' | 'teal' | 'sunset';

export const APP_BACKGROUND_THEME_STORAGE_KEY = 'appBackgroundTheme';
export const APP_BACKGROUND_THEME_CHANGE_EVENT = 'app-background-theme-change';
export const DEFAULT_APP_BACKGROUND_THEME: AppBackgroundTheme = 'dynamic-waves';
export const APP_BACKGROUND_PRESET_STORAGE_KEY = 'appBackgroundPreset';
export const APP_BACKGROUND_PRESET_CHANGE_EVENT = 'app-background-preset-change';
export const DEFAULT_APP_BACKGROUND_PRESET: AppBackgroundPreset = 'indigo';

export type AppBackgroundThemeOption = {
  id: AppBackgroundTheme;
  name: string;
  subtitle: string;
  status: 'stable' | 'under-development';
};

export type AppBackgroundPresetOption = {
  id: AppBackgroundPreset;
  name: string;
  swatchClassName: string;
};

export const APP_BACKGROUND_THEME_OPTIONS: AppBackgroundThemeOption[] = [
  {
    id: 'dynamic-waves',
    name: 'Dynamic Waves',
    subtitle: 'Current app theme',
    status: 'stable',
  },
  {
    id: 'contour-drift',
    name: 'Contour Drift',
    subtitle: 'Topographic flow field',
    status: 'stable',
  },
  {
    id: 'aurora-lattice',
    name: 'Aurora Lattice',
    subtitle: 'Under development',
    status: 'under-development',
  },
];

export const APP_BACKGROUND_PRESET_OPTIONS: AppBackgroundPresetOption[] = [
  {
    id: 'indigo',
    name: 'Indigo',
    swatchClassName:
      'bg-[linear-gradient(140deg,#3730a3_0%,#4338ca_30%,#1d4ed8_70%,#0f172a_100%)]',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    swatchClassName:
      'bg-[linear-gradient(140deg,#0f766e_0%,#0284c7_35%,#1d4ed8_70%,#0b1025_100%)]',
  },
  {
    id: 'teal',
    name: 'Teal',
    swatchClassName:
      'bg-[linear-gradient(140deg,#0f766e_0%,#14b8a6_35%,#0891b2_70%,#0a1724_100%)]',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    swatchClassName:
      'bg-[linear-gradient(140deg,#7c2d12_0%,#be123c_35%,#7c3aed_70%,#111827_100%)]',
  },
];

export function isAppBackgroundTheme(value: string): value is AppBackgroundTheme {
  return APP_BACKGROUND_THEME_OPTIONS.some((theme) => theme.id === value);
}

export function isAppBackgroundPreset(value: string): value is AppBackgroundPreset {
  return APP_BACKGROUND_PRESET_OPTIONS.some((preset) => preset.id === value);
}

export function getStoredAppBackgroundTheme(): AppBackgroundTheme {
  try {
    const value = localStorage.getItem(APP_BACKGROUND_THEME_STORAGE_KEY);
    if (value && isAppBackgroundTheme(value)) return value;
  } catch {}
  return DEFAULT_APP_BACKGROUND_THEME;
}

export function getStoredAppBackgroundPreset(): AppBackgroundPreset {
  try {
    const value = localStorage.getItem(APP_BACKGROUND_PRESET_STORAGE_KEY);
    if (value && isAppBackgroundPreset(value)) return value;
  } catch {}
  return DEFAULT_APP_BACKGROUND_PRESET;
}

export function setStoredAppBackgroundTheme(theme: AppBackgroundTheme) {
  try {
    localStorage.setItem(APP_BACKGROUND_THEME_STORAGE_KEY, theme);
  } catch {}
  window.dispatchEvent(new CustomEvent<AppBackgroundTheme>(APP_BACKGROUND_THEME_CHANGE_EVENT, { detail: theme }));
}

export function setStoredAppBackgroundPreset(preset: AppBackgroundPreset) {
  try {
    localStorage.setItem(APP_BACKGROUND_PRESET_STORAGE_KEY, preset);
  } catch {}
  window.dispatchEvent(new CustomEvent<AppBackgroundPreset>(APP_BACKGROUND_PRESET_CHANGE_EVENT, { detail: preset }));
}
