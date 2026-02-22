import type { LinkTarget } from '../../lib/linking';

export type LinkPickerTab = 'external' | 'file' | 'resource' | 'planner' | 'board' | 'help';

export type LinkPickerOption = {
  id: string;
  tab: Exclude<LinkPickerTab, 'external'>;
  title: string;
  subtitle?: string;
  badge?: string;
  warning?: string;
  target: LinkTarget;
};

export type LinkResolvedMeta = {
  exists: boolean;
  title?: string;
  subtitle?: string;
  warning?: string;
};
