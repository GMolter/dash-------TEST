import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';
import { ClassDashSettings, ClassMeeting } from '../features/classdash/model';
import { CLASSDASH_PLUGIN_ID } from '../features/plugins/catalog';
import { DASHBOARD_CONFIGURATION_CHANGED_EVENT } from './useDashboardConfiguration';

type MeetingDraft = Omit<ClassMeeting, 'id' | 'user_id' | 'sort_order'> & { id?: string };

export function useClassDash() {
  const { user } = useAuth();
  const [installed, setInstalled] = useState(false);
  const [settings, setSettings] = useState<ClassDashSettings | null>(null);
  const [meetings, setMeetings] = useState<ClassMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setInstalled(false);
      setSettings(null);
      setMeetings([]);
      setLoading(false);
      return;
    }
    const [installationResult, settingsResult, meetingsResult] = await Promise.all([
      supabase.from('user_plugin_installations').select('plugin_id').eq('user_id', user.id).eq('plugin_id', CLASSDASH_PLUGIN_ID).maybeSingle(),
      supabase.from('classdash_settings').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('classdash_classes').select('*').eq('user_id', user.id).order('sort_order').order('start_time'),
    ]);
    const firstError = installationResult.error || settingsResult.error || meetingsResult.error;
    if (firstError) {
      setError(`ClassDash data is unavailable. Apply the latest Supabase migration. ${firstError.message}`);
    } else {
      setError(null);
      setInstalled(!!installationResult.data);
      setSettings((settingsResult.data as ClassDashSettings | null) ?? null);
      setMeetings((meetingsResult.data || []) as ClassMeeting[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(DASHBOARD_CONFIGURATION_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DASHBOARD_CONFIGURATION_CHANGED_EVENT, onChange);
  }, [refresh]);

  const saveSettings = useCallback(async (draft: Omit<ClassDashSettings, 'user_id'>) => {
    if (!user) return false;
    setSyncing(true);
    setError(null);
    const { error: saveError } = await supabase.from('classdash_settings').upsert({
      ...draft,
      user_id: user.id,
      updated_at: new Date().toISOString(),
    });
    setSyncing(false);
    if (saveError) {
      setError(saveError.message);
      return false;
    }
    await refresh();
    return true;
  }, [refresh, user]);

  const saveMeeting = useCallback(async (draft: MeetingDraft) => {
    if (!user) return false;
    setSyncing(true);
    setError(null);
    const record = {
      code: draft.code.trim(),
      title: draft.title.trim(),
      section: draft.section.trim(),
      days: [...draft.days].sort(),
      start_time: draft.start_time,
      end_time: draft.end_time,
      location_name: draft.location_name.trim(),
      location_lat: draft.location_lat,
      location_lng: draft.location_lng,
      term_start: draft.term_start || null,
      term_end: draft.term_end || null,
      updated_at: new Date().toISOString(),
    };
    const operation = draft.id
      ? supabase.from('classdash_classes').update(record).eq('id', draft.id).eq('user_id', user.id)
      : supabase.from('classdash_classes').insert({ ...record, user_id: user.id, sort_order: meetings.length });
    const { error: saveError } = await operation;
    setSyncing(false);
    if (saveError) {
      setError(saveError.message);
      return false;
    }
    await refresh();
    return true;
  }, [meetings.length, refresh, user]);

  const deleteMeeting = useCallback(async (id: string) => {
    if (!user) return false;
    setSyncing(true);
    const { error: deleteError } = await supabase.from('classdash_classes').delete().eq('id', id).eq('user_id', user.id);
    setSyncing(false);
    if (deleteError) {
      setError(deleteError.message);
      return false;
    }
    await refresh();
    return true;
  }, [refresh, user]);

  return { installed, settings, meetings, loading, syncing, error, saveSettings, saveMeeting, deleteMeeting, refresh };
}

