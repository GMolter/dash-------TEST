export const config = { runtime: 'nodejs', maxDuration: 30 };

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBody(raw: any) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString('utf8'));
    } catch {
      return {};
    }
  }
  return raw;
}

function stripWrappingQuotes(value: string) {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1).trim();
  }
  return v;
}

function normalizeSupabaseUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = stripWrappingQuotes(raw);
  if (!cleaned) return null;
  const embedded =
    cleaned.match(/https?:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0] ||
    cleaned.match(/[a-z0-9-]+\.supabase\.co/i)?.[0];
  const base = embedded || cleaned;
  const candidate = /^https?:\/\//i.test(base) ? base : `https://${base}`;

  try {
    const parsed = new URL(candidate);
    return parsed.origin;
  } catch {
    return null;
  }
}

function readSupabaseConfig() {
  const url =
    normalizeSupabaseUrl(process.env.SUPABASE_URL) ||
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    normalizeSupabaseUrl(process.env.VITE_SUPABASE_URL);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceKey) return { ok: false as const, error: 'Missing SUPABASE_SERVICE_ROLE_KEY' };
  if (!url) {
    return {
      ok: false as const,
      error: 'SUPABASE_URL is invalid.',
      detail:
        'Expected format like https://<project-ref>.supabase.co (no quotes, no trailing text).',
    };
  }
  return { ok: true as const, url, serviceKey };
}

function supabaseHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const configuredAdminPasswordRaw = process.env.ADMIN_PASSWORD || process.env.ADMIN_COOKIE_SECRET || '';
    const configuredAdminPasswordClean = stripWrappingQuotes(configuredAdminPasswordRaw);
    if (!configuredAdminPasswordRaw) {
      return res.status(503).json({ error: 'Missing ADMIN_PASSWORD or ADMIN_COOKIE_SECRET' });
    }

    const body = parseBody(req.body);
    const projectId = asString(body?.projectId);
    const password = asString(body?.password);
    const unlimited = Boolean(body?.unlimited);
    const usageCountRaw = body?.usageCount;

    if (!projectId) return res.status(400).json({ error: 'Missing projectId' });
    if (!password) return res.status(400).json({ error: 'Missing password' });
    if (password !== configuredAdminPasswordRaw && password !== configuredAdminPasswordClean) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const usageCount =
      typeof usageCountRaw === 'number' && Number.isFinite(usageCountRaw)
        ? Math.max(0, Math.floor(usageCountRaw))
        : null;
    if (!unlimited && usageCount === null) {
      return res.status(400).json({ error: 'usageCount must be a valid number when unlimited is false' });
    }

    const cfg = readSupabaseConfig();
    if (!cfg.ok) return res.status(503).json({ error: cfg.error, detail: cfg.detail || '' });

    const projectLookupUrl = `${cfg.url}/rest/v1/projects?select=id&id=eq.${encodeURIComponent(projectId)}&limit=1`;
    const projectLookupRes = await fetch(projectLookupUrl, {
      method: 'GET',
      headers: supabaseHeaders(cfg.serviceKey),
    });
    const projectLookupText = await projectLookupRes.text();
    const projectLookupJson = (() => {
      try {
        return projectLookupText ? JSON.parse(projectLookupText) : [];
      } catch {
        return null;
      }
    })();
    if (!projectLookupRes.ok) {
      return res.status(503).json({
        error: 'Project lookup failed',
        detail:
          (projectLookupJson as any)?.message ||
          (projectLookupJson as any)?.error ||
          projectLookupText.slice(0, 220) ||
          `HTTP ${projectLookupRes.status}`,
      });
    }
    if (!Array.isArray(projectLookupJson) || !projectLookupJson.length) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const patch: Record<string, unknown> = {
      ai_plan_unlimited: unlimited,
      updated_at: new Date().toISOString(),
    };
    if (!unlimited) patch.ai_plan_usage_count = usageCount;

    const updateUrl = `${cfg.url}/rest/v1/projects?id=eq.${encodeURIComponent(projectId)}&select=id,ai_plan_usage_count,ai_plan_unlimited`;
    const updateRes = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        ...supabaseHeaders(cfg.serviceKey),
        Prefer: 'return=representation',
      },
      body: JSON.stringify(patch),
    });

    const updateText = await updateRes.text();
    const updateJson = (() => {
      try {
        return updateText ? JSON.parse(updateText) : [];
      } catch {
        return null;
      }
    })();

    if (!updateRes.ok) {
      return res.status(503).json({
        error: 'Failed to update usage settings',
        detail:
          (updateJson as any)?.message ||
          (updateJson as any)?.error ||
          updateText.slice(0, 220) ||
          `HTTP ${updateRes.status}`,
      });
    }

    const updated = Array.isArray(updateJson) ? updateJson[0] : updateJson;
    if (!updated || typeof updated !== 'object') {
      return res.status(503).json({ error: 'Failed to update usage settings', detail: 'No updated row returned' });
    }

    return res.status(200).json({
      ok: true,
      usage: {
        used: Math.max(0, Number((updated as any).ai_plan_usage_count || 0)),
        unlimited: Boolean((updated as any).ai_plan_unlimited),
        limit: 5,
      },
    });
  } catch (err: any) {
    console.error('projects/ai-usage-admin crash:', err);
    return res.status(502).json({
      error: 'AI usage admin update failed.',
      detail: String(err?.message || err),
    });
  }
}
