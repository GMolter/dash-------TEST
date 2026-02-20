export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceConfig } from '../_utils/supabaseConfig';

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readBearerToken(req: any) {
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  const value = String(raw);
  if (!value.toLowerCase().startsWith('bearer ')) return null;
  return value.slice(7).trim() || null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const configuredAdminPassword = process.env.ADMIN_PASSWORD || '';
  if (!configuredAdminPassword) return res.status(500).json({ error: 'Missing ADMIN_PASSWORD' });

  const cfg = getSupabaseServiceConfig();
  if (!cfg.ok) return res.status(503).json({ error: cfg.error, detail: cfg.detail || '' });

  const accessToken = readBearerToken(req);
  if (!accessToken) return res.status(401).json({ error: 'Unauthorized' });

  const projectId = asString(req.body?.projectId);
  const password = asString(req.body?.password);
  const unlimited = Boolean(req.body?.unlimited);
  const usageCountRaw = req.body?.usageCount;

  if (!projectId) return res.status(400).json({ error: 'Missing projectId' });
  if (!password) return res.status(400).json({ error: 'Missing password' });
  if (password !== configuredAdminPassword) return res.status(401).json({ error: 'Invalid password' });

  const usageCount =
    typeof usageCountRaw === 'number' && Number.isFinite(usageCountRaw) ? Math.max(0, Math.floor(usageCountRaw)) : null;
  if (!unlimited && usageCount === null) {
    return res.status(400).json({ error: 'usageCount must be a valid number when unlimited is false' });
  }

  const db = createClient(cfg.url, cfg.serviceKey);
  const { data: userData, error: userError } = await db.auth.getUser(accessToken);
  if (userError || !userData.user) return res.status(401).json({ error: 'Invalid auth session' });
  const userId = userData.user.id;

  const { data: profileData, error: profileError } = await db
    .from('profiles')
    .select('org_id,role,app_admin')
    .eq('id', userId)
    .maybeSingle();
  if (profileError || !profileData) return res.status(403).json({ error: 'Access denied' });

  const profile = profileData as { org_id: string | null; role: string | null; app_admin: boolean | null };
  const isScopedAdmin = profile.role === 'admin' || profile.role === 'owner' || !!profile.app_admin;
  if (!isScopedAdmin) return res.status(403).json({ error: 'Admin access required' });

  const { data: projectData, error: projectError } = await db
    .from('projects')
    .select('id,org_id,user_id')
    .eq('id', projectId)
    .maybeSingle();
  if (projectError || !projectData) return res.status(404).json({ error: 'Project not found' });

  const project = projectData as { id: string; org_id: string | null; user_id: string | null };
  const hasAccess =
    project.user_id === userId ||
    (project.org_id && profile.org_id && project.org_id === profile.org_id);
  if (!hasAccess) return res.status(403).json({ error: 'Project access denied' });

  const patch: Record<string, unknown> = {
    ai_plan_unlimited: unlimited,
    updated_at: new Date().toISOString(),
  };
  if (!unlimited) patch.ai_plan_usage_count = usageCount;

  const { data: updated, error: updateError } = await db
    .from('projects')
    .update(patch)
    .eq('id', projectId)
    .select('id,ai_plan_usage_count,ai_plan_unlimited')
    .single();
  if (updateError) return res.status(500).json({ error: 'Failed to update usage settings' });

  return res.status(200).json({
    ok: true,
    usage: {
      used: Number((updated as any).ai_plan_usage_count || 0),
      unlimited: Boolean((updated as any).ai_plan_unlimited),
      limit: 5,
    },
  });
}

