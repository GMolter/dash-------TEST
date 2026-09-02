import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';
import {
  DASHBOARD_MODULES,
  DashboardModuleId,
  DashboardModuleSpan,
  DEFAULT_DASHBOARD_ORDER,
  DEFAULT_DASHBOARD_SPANS,
  PluginId,
} from '../features/plugins/catalog';

export const DASHBOARD_CONFIGURATION_CHANGED_EVENT = 'olio:dashboard-configuration-changed';

type PluginInstallation = {
  user_id: string;
  plugin_id: string;
  dashboard_enabled: boolean;
  dashboard_order: number;
};

type StoredDashboardModule = {
  user_id: string;
  module_id: string;
  enabled: boolean;
  order_index: number;
  column_span: DashboardModuleSpan;
};

export type DashboardModule = {
  id: DashboardModuleId;
  name: string;
  description: string;
  enabled: boolean;
  order: number;
  span: DashboardModuleSpan;
  available: boolean;
};

function emitChange() {
  window.dispatchEvent(new Event(DASHBOARD_CONFIGURATION_CHANGED_EVENT));
}

export function useDashboardConfiguration() {
  const { user } = useAuth();
  const [installations, setInstallations] = useState<PluginInstallation[]>([]);
  const [storedModules, setStoredModules] = useState<StoredDashboardModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setInstallations([]);
      setStoredModules([]);
      setLoading(false);
      return;
    }

    const [installationsResult, modulesResult] = await Promise.all([
      supabase.from('user_plugin_installations').select('*').eq('user_id', user.id),
      supabase.from('user_dashboard_modules').select('*').eq('user_id', user.id),
    ]);

    const firstError = installationsResult.error || modulesResult.error;
    if (firstError) {
      setError(`Dashboard configuration is unavailable. Apply the latest Supabase migration. ${firstError.message}`);
    } else {
      setError(null);
      setInstallations((installationsResult.data || []) as PluginInstallation[]);
      setStoredModules((modulesResult.data || []) as StoredDashboardModule[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(DASHBOARD_CONFIGURATION_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DASHBOARD_CONFIGURATION_CHANGED_EVENT, onChange);
  }, [refresh]);

  const installedPluginIds = useMemo(
    () => new Set(installations.map((installation) => installation.plugin_id)),
    [installations],
  );

  const modules = useMemo<DashboardModule[]>(() => {
    const stored = new Map(storedModules.map((module) => [module.module_id, module]));
    return DASHBOARD_MODULES.map((definition, fallbackOrder) => {
      const saved = stored.get(definition.id);
      const available = !('pluginId' in definition) || installedPluginIds.has(definition.pluginId);
      return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        enabled: available && (saved?.enabled ?? true),
        order: saved?.order_index ?? fallbackOrder,
        span: saved?.column_span ?? DEFAULT_DASHBOARD_SPANS[definition.id],
        available,
      };
    }).sort((a, b) => a.order - b.order);
  }, [installedPluginIds, storedModules]);

  const installPlugin = useCallback(async (pluginId: PluginId) => {
    if (!user) return false;
    setSyncing(true);
    setError(null);
    const { error: installError } = await supabase.from('user_plugin_installations').upsert({
      user_id: user.id,
      plugin_id: pluginId,
      dashboard_enabled: true,
      dashboard_order: 0,
      updated_at: new Date().toISOString(),
    });
    setSyncing(false);
    if (installError) {
      setError(installError.message);
      return false;
    }
    emitChange();
    return true;
  }, [user]);

  const uninstallPlugin = useCallback(async (pluginId: PluginId) => {
    if (!user) return false;
    setSyncing(true);
    setError(null);
    const { error: uninstallError } = await supabase
      .from('user_plugin_installations')
      .delete()
      .eq('user_id', user.id)
      .eq('plugin_id', pluginId);
    setSyncing(false);
    if (uninstallError) {
      setError(uninstallError.message);
      return false;
    }
    emitChange();
    return true;
  }, [user]);

  const updateModule = useCallback(async (moduleId: DashboardModuleId, enabled: boolean) => {
    if (!user) return false;
    const current = modules.find((module) => module.id === moduleId);
    setSyncing(true);
    const { error: updateError } = await supabase.from('user_dashboard_modules').upsert({
      user_id: user.id,
      module_id: moduleId,
      enabled,
      order_index: current?.order ?? DEFAULT_DASHBOARD_ORDER.indexOf(moduleId),
      column_span: current?.span ?? DEFAULT_DASHBOARD_SPANS[moduleId],
      updated_at: new Date().toISOString(),
    });
    setSyncing(false);
    if (updateError) {
      setError(updateError.message);
      return false;
    }
    emitChange();
    return true;
  }, [modules, user]);

  const moveModule = useCallback(async (moduleId: DashboardModuleId, direction: 'up' | 'down') => {
    if (!user) return false;
    const available = modules.filter((module) => module.available && module.id !== 'tasks');
    const index = available.findIndex((module) => module.id === moduleId);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= available.length) return false;
    const reordered = [...available];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    setSyncing(true);
    const { error: moveError } = await supabase.from('user_dashboard_modules').upsert(
      reordered.map((module, orderIndex) => ({
        user_id: user.id,
        module_id: module.id,
        enabled: module.enabled,
        order_index: orderIndex,
        column_span: module.span,
        updated_at: new Date().toISOString(),
      })),
    );
    setSyncing(false);
    if (moveError) {
      setError(moveError.message);
      return false;
    }
    emitChange();
    return true;
  }, [modules, user]);

  const reorderModules = useCallback(async (moduleIds: DashboardModuleId[]) => {
    if (!user) return false;
    const availableById = new Map(modules.filter((module) => module.available && module.id !== 'tasks').map((module) => [module.id, module]));
    const ordered = moduleIds.map((id) => availableById.get(id)).filter((module): module is DashboardModule => !!module);
    if (ordered.length !== availableById.size) return false;
    setSyncing(true);
    const { error: reorderError } = await supabase.from('user_dashboard_modules').upsert(
      ordered.map((module, orderIndex) => ({
        user_id: user.id,
        module_id: module.id,
        enabled: module.enabled,
        order_index: orderIndex,
        column_span: module.span,
        updated_at: new Date().toISOString(),
      })),
    );
    setSyncing(false);
    if (reorderError) {
      setError(reorderError.message);
      return false;
    }
    emitChange();
    return true;
  }, [modules, user]);

  const updateModuleSpan = useCallback(async (moduleId: DashboardModuleId, span: DashboardModuleSpan) => {
    if (!user) return false;
    const current = modules.find((module) => module.id === moduleId);
    if (!current) return false;
    setSyncing(true);
    const { error: resizeError } = await supabase.from('user_dashboard_modules').upsert({
      user_id: user.id,
      module_id: moduleId,
      enabled: current.enabled,
      order_index: current.order,
      column_span: span,
      updated_at: new Date().toISOString(),
    });
    setSyncing(false);
    if (resizeError) {
      setError(resizeError.message);
      return false;
    }
    emitChange();
    return true;
  }, [modules, user]);

  return {
    loading,
    syncing,
    error,
    modules,
    installedPluginIds,
    installPlugin,
    uninstallPlugin,
    updateModule,
    moveModule,
    reorderModules,
    updateModuleSpan,
    refresh,
  };
}
