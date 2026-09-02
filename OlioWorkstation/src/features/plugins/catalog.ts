import { GraduationCap } from 'lucide-react';

export const CLASSDASH_PLUGIN_ID = 'classdash';

export const pluginCatalog = [
  {
    id: CLASSDASH_PLUGIN_ID,
    name: 'ClassDash',
    description: 'See your next class, walking time, and leave-by countdown.',
    route: '/classdash',
    icon: GraduationCap,
  },
] as const;

export type PluginId = (typeof pluginCatalog)[number]['id'];

export const DASHBOARD_MODULES = [
  { id: 'classdash', name: 'ClassDash', description: 'Next-class countdown and walking estimate.', pluginId: CLASSDASH_PLUGIN_ID },
  { id: 'quicklinks', name: 'Quick Links', description: 'Your personal and shared bookmarks.' },
  { id: 'shortcuts', name: 'Utility shortcuts', description: 'Fast links to QR Generator, Quick Pastes, and Utilities.' },
  { id: 'tasks', name: 'My Tasks button', description: 'The task drawer button in the top-right corner.' },
] as const;

export type DashboardModuleId = (typeof DASHBOARD_MODULES)[number]['id'];

export const DEFAULT_DASHBOARD_ORDER: DashboardModuleId[] = ['classdash', 'quicklinks', 'shortcuts', 'tasks'];

export type DashboardModuleSpan = 4 | 6 | 8 | 12;

export const DEFAULT_DASHBOARD_SPANS: Record<DashboardModuleId, DashboardModuleSpan> = {
  classdash: 12,
  quicklinks: 12,
  shortcuts: 12,
  tasks: 4,
};
