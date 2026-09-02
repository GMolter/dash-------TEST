import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';

export type DashboardLayoutItem = {
  item_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hidden: boolean;
};

export type DashboardQuicklink = {
  id: string;
  title: string;
  url: string;
  icon: string;
  order_index: number;
  folder_id?: string | null;
};

export type DashboardQuicklinkFolder = {
  id: string;
  name: string;
  icon: string;
  order_index: number;
};

const LAYOUT_CACHE_PREFIX = 'olio-freeform-dashboard-v1';

function cacheKey(userId: string) {
  return `${LAYOUT_CACHE_PREFIX}:${userId}`;
}

function readLayoutCache(userId: string): DashboardLayoutItem[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(cacheKey(userId)) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLayoutCache(userId: string, layouts: DashboardLayoutItem[]) {
  try {
    window.localStorage.setItem(cacheKey(userId), JSON.stringify(layouts));
  } catch {
    // Account storage remains authoritative when browser storage is unavailable.
  }
}

function readQuicklinkCache(userId: string): { links: DashboardQuicklink[]; folders: DashboardQuicklinkFolder[] } {
  try {
    const value = JSON.parse(window.localStorage.getItem(`olio-quicklinks-v1:${userId}`) || '{}');
    return {
      links: Array.isArray(value?.links) ? value.links : [],
      folders: Array.isArray(value?.folders) ? value.folders : [],
    };
  } catch {
    return { links: [], folders: [] };
  }
}

export function useFreeformDashboard() {
  const { user } = useAuth();
  const [layouts, setLayouts] = useState<DashboardLayoutItem[]>([]);
  const [quicklinks, setQuicklinks] = useState<DashboardQuicklink[]>([]);
  const [folders, setFolders] = useState<DashboardQuicklinkFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');

  useEffect(() => {
    if (!user) {
      setLayouts([]);
      setQuicklinks([]);
      setFolders([]);
      setLoading(false);
      return;
    }
    const userId = user.id;
    const cachedLayouts = readLayoutCache(userId);
    const cachedQuicklinks = readQuicklinkCache(userId);
    if (cachedLayouts.length) setLayouts(cachedLayouts);
    if (cachedQuicklinks.links.length) setQuicklinks(cachedQuicklinks.links);
    if (cachedQuicklinks.folders.length) setFolders(cachedQuicklinks.folders);
    let cancelled = false;

    void Promise.all([
      supabase.from('user_dashboard_layout_items').select('item_id,x,y,width,height,hidden').eq('user_id', userId),
      supabase.from('quicklinks').select('id,title,url,icon,order_index,folder_id,scope,user_id').eq('user_id', userId).order('order_index', { ascending: true }),
      supabase.from('quicklink_folders').select('id,name,icon,order_index,scope,user_id').eq('user_id', userId).order('order_index', { ascending: true }),
    ]).then(([layoutResult, quicklinkResult, folderResult]) => {
      if (cancelled) return;
      if (!layoutResult.error && layoutResult.data) {
        const nextLayouts = layoutResult.data as DashboardLayoutItem[];
        setLayouts(nextLayouts);
        writeLayoutCache(userId, nextLayouts);
        setWarning('');
      } else if (layoutResult.error) {
        setWarning('Layout changes are saved on this device until the latest dashboard migration is applied.');
      }
      if (!quicklinkResult.error && quicklinkResult.data) {
        setQuicklinks((quicklinkResult.data as Array<DashboardQuicklink & { scope?: string }>)
          .filter((link) => !link.scope || link.scope === 'personal' || link.scope === 'both'));
      }
      if (!folderResult.error && folderResult.data) {
        setFolders((folderResult.data as Array<DashboardQuicklinkFolder & { scope?: string }>)
          .filter((folder) => !folder.scope || folder.scope === 'personal' || folder.scope === 'both'));
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [user]);

  const saveLayouts = useCallback(async (nextLayouts: DashboardLayoutItem[]) => {
    if (!user) return false;
    setLayouts(nextLayouts);
    writeLayoutCache(user.id, nextLayouts);
    const { error } = await supabase.from('user_dashboard_layout_items').upsert(
      nextLayouts.map((layout) => ({
        user_id: user.id,
        ...layout,
        updated_at: new Date().toISOString(),
      })),
    );
    if (error) {
      setWarning('Layout changes are saved on this device until the latest dashboard migration is applied.');
      return false;
    }
    setWarning('');
    return true;
  }, [user]);

  return { layouts, quicklinks, folders, loading, warning, saveLayouts };
}
