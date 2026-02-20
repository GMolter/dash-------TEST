export const config = { runtime: 'nodejs', maxDuration: 60 };
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceConfig } from '../_utils/supabaseConfig';

type PlannerInputItem = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  due_date?: unknown;
  completed?: unknown;
};

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

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asLimitedString(value: unknown, max: number) {
  const text = asString(value);
  if (!text) return '';
  return text.length > max ? text.slice(0, max).trim() : text;
}

function normalizeDueDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function sanitizeContextItems(items: unknown) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 20)
    .map((item) => {
      const row = (item || {}) as PlannerInputItem;
      return {
        id: asLimitedString(row.id, 120),
        title: asLimitedString(row.title, 180),
        description: asLimitedString(row.description, 420),
        due_date: normalizeDueDate(row.due_date),
        completed: Boolean(row.completed),
      };
    })
    .filter((item) => item.id && item.title);
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

function safeJsonParse(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function parseStructuredJson(content: string) {
  const direct = safeJsonParse(content);
  if (direct) return direct;

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!fenced) return null;
  return safeJsonParse(fenced[1] || '');
}

function normalizeMessageContent(content: unknown): string | null {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed || null;
  }

  if (!Array.isArray(content)) return null;

  const text = content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const chunk = part as { type?: unknown; text?: unknown };
      if (chunk.type !== 'text') return '';
      return asString(chunk.text);
    })
    .filter(Boolean)
    .join('\n')
    .trim();

  return text || null;
}

function readBearerToken(req: any) {
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  const value = String(raw);
  if (!value.toLowerCase().startsWith('bearer ')) return null;
  return value.slice(7).trim() || null;
}

export default async function handler(req: any, res: any) {
  const DB_STEP_TIMEOUT_MS = 1100;
  const OPENAI_TIMEOUT_MS = 4000;

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'Missing OPENAI_API_KEY' });
    }

    const body = parseBody(req.body);

    const goal = asLimitedString(body?.goal, 1200);
    const projectId = asString(body?.projectId);
    if (!goal) {
      return res.status(400).json({ error: 'Goal is required.' });
    }
    if (!projectId) {
      return res.status(400).json({ error: 'Project id is required.' });
    }

    const cfg = getSupabaseServiceConfig();
    if (!cfg.ok) {
      return res.status(503).json({ error: cfg.error, detail: cfg.detail || '' });
    }

    const accessToken = readBearerToken(req);
    if (!accessToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = createClient(cfg.url, cfg.serviceKey);
    const { data: userData, error: userError } = await withTimeout(
      db.auth.getUser(accessToken),
      DB_STEP_TIMEOUT_MS,
      'Auth validation',
    );
    if (userError || !userData.user) {
      return res.status(401).json({ error: 'Invalid auth session' });
    }

    const userId = userData.user.id;
    const { data: projectData, error: projectError } = await withTimeout(
      db
        .from('projects')
        .select('id,org_id,user_id,ai_plan_usage_count,ai_plan_unlimited')
        .eq('id', projectId)
        .maybeSingle(),
      DB_STEP_TIMEOUT_MS,
      'Project lookup',
    );
    if (projectError || !projectData) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const project = projectData as {
      id: string;
      org_id: string | null;
      user_id: string | null;
      ai_plan_usage_count?: number | null;
      ai_plan_unlimited?: boolean | null;
    };

    let userOrgId: string | null = null;
    if (project.user_id !== userId && project.org_id) {
      const { data: profileData } = await withTimeout(
        db
          .from('profiles')
          .select('org_id')
          .eq('id', userId)
          .maybeSingle(),
        DB_STEP_TIMEOUT_MS,
        'Profile lookup',
      );
      userOrgId = (profileData as { org_id?: string | null } | null)?.org_id || null;
    }
    const hasProjectAccess =
      project.user_id === userId || (project.org_id && userOrgId && project.org_id === userOrgId);
    if (!hasProjectAccess) {
      return res.status(403).json({ error: 'Project access denied.' });
    }

    const usageLimit = 5;
    let usageMeta = {
      used: 0,
      limit: usageLimit,
      unlimited: false,
      remaining: usageLimit as number | null,
    };

    const { data: usageData, error: usageError } = await withTimeout(
      db.rpc('consume_project_ai_usage', {
        p_project_id: projectId,
        p_limit: usageLimit,
      }),
      DB_STEP_TIMEOUT_MS,
      'Usage consume',
    );

    if (usageError) {
      // Fallback for environments where the RPC migration has not been applied yet.
      const currentUsed = Math.max(0, Number(project.ai_plan_usage_count || 0));
      const currentUnlimited = Boolean(project.ai_plan_unlimited);
      if (!currentUnlimited && currentUsed >= usageLimit) {
        usageMeta = {
          used: currentUsed,
          limit: usageLimit,
          unlimited: false,
          remaining: 0,
        };
        return res.status(429).json({
          error: 'AI plan limit reached for this project.',
          usage: usageMeta,
          code: 'AI_USAGE_LIMIT_REACHED',
        });
      }

      const nextUsed = currentUnlimited ? currentUsed : currentUsed + 1;
      const { error: fallbackUpdateError } = await withTimeout(
        db
          .from('projects')
          .update({ ai_plan_usage_count: nextUsed, updated_at: new Date().toISOString() })
          .eq('id', projectId),
        DB_STEP_TIMEOUT_MS,
        'Usage fallback update',
      );
      if (fallbackUpdateError) {
        return res.status(503).json({
          error: 'Failed to process AI usage limit.',
          detail: String(fallbackUpdateError.message || fallbackUpdateError.code || 'usage update failed'),
        });
      }

      usageMeta = {
        used: nextUsed,
        limit: usageLimit,
        unlimited: currentUnlimited,
        remaining: currentUnlimited ? null : Math.max(0, usageLimit - nextUsed),
      };
    } else {
      const usageRow = Array.isArray(usageData) ? usageData[0] : usageData;
      const usageCount = Math.max(0, Number(usageRow?.usage_count || 0));
      const unlimited = Boolean(usageRow?.unlimited);
      const allowed = Boolean(usageRow?.allowed);

      usageMeta = {
        used: usageCount,
        limit: usageLimit,
        unlimited,
        remaining: unlimited ? null : Math.max(0, usageLimit - usageCount),
      };

      if (!allowed) {
        return res.status(429).json({
          error: 'AI plan limit reached for this project.',
          usage: usageMeta,
          code: 'AI_USAGE_LIMIT_REACHED',
        });
      }
    }

    const additionalInstructions = asLimitedString(body?.additionalInstructions, 1200);
    const allowDeletionSuggestions = Boolean(body?.allowDeletionSuggestions);
    const plannerTasks = sanitizeContextItems(body?.context?.plannerTasks);
    const boardCards = sanitizeContextItems(body?.context?.boardCards);
    const plannerIds = new Set(plannerTasks.map((item) => item.id));
    const boardIds = new Set(boardCards.map((item) => item.id));

    const today = new Date().toISOString().slice(0, 10);
    const schema = {
    name: 'planner_tasks',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        tasks: {
          type: 'array',
          minItems: 0,
          maxItems: 15,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              dueDate: {
                anyOf: [
                  { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                  { type: 'null' },
                ],
              },
            },
            required: ['title', 'description', 'dueDate'],
          },
        },
        deletions: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              source: { type: 'string', enum: ['planner', 'board'] },
              id: { type: 'string' },
              title: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['source', 'id', 'title', 'reason'],
          },
        },
      },
      required: ['tasks', 'deletions'],
    },
    strict: true,
  };

    const controller = new AbortController();
    // Keep upstream call under common serverless timeout ceilings to avoid platform-level 500s.
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    let openaiRes: Response;
    try {
      openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.4,
          response_format: {
            type: 'json_schema',
            json_schema: schema,
          },
          messages: [
            {
              role: 'system',
              content:
                'You are a project planning assistant. Return concise, actionable task plans. Respect provided context and avoid duplicating already completed items.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                today,
                goal,
                additionalInstructions,
                guidance:
                  'Generate tasks in recommended execution order. Assign dueDate only when timeline evidence exists; otherwise dueDate must be null.',
                deletionPolicy: allowDeletionSuggestions
                  ? 'You may suggest deletions only for stale/duplicate/obsolete items and only from provided ids.'
                  : 'Do not suggest any deletions. Return deletions as an empty array.',
                context: {
                  plannerTasks,
                  boardCards,
                },
              }),
            },
          ],
        }),
      });
    } catch (fetchError: any) {
      if (fetchError?.name === 'AbortError') {
        return res.status(504).json({ error: 'AI generation timed out. Please try again with less context.' });
      }
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    const openAiRawText = await openaiRes.text();
    const raw = safeJsonParse(openAiRawText);
    if (!raw || typeof raw !== 'object') {
      return res.status(502).json({
        error: 'OpenAI returned a non-JSON response.',
        detail:
          typeof openAiRawText === 'string' && openAiRawText.trim()
            ? openAiRawText.trim().slice(0, 240)
            : 'Upstream response could not be parsed.',
      });
    }

    if (!openaiRes.ok) {
      return res.status(502).json({
        error: 'OpenAI request failed.',
        detail: (raw as any)?.error?.message || (raw as any)?.error || 'Unknown OpenAI error',
      });
    }

    const content = normalizeMessageContent((raw as any)?.choices?.[0]?.message?.content);
    if (!content) {
      return res.status(502).json({ error: 'OpenAI response was missing structured output.' });
    }

    const parsed = parseStructuredJson(content);
    if (!parsed || !Array.isArray(parsed.tasks)) {
      return res.status(502).json({ error: 'Failed to parse AI planner output.' });
    }

    const tasks = parsed.tasks
      .map((task: any) => ({
        title: asString(task?.title),
        description: asString(task?.description),
        dueDate: normalizeDueDate(task?.dueDate),
      }))
      .filter((task: any) => task.title)
      .slice(0, 15);

    const deletions = Array.isArray(parsed.deletions)
      ? parsed.deletions
          .map((item: any) => ({
            source: item?.source === 'board' ? 'board' : 'planner',
            id: asString(item?.id),
            title: asString(item?.title),
            reason: asString(item?.reason),
          }))
          .filter((item: any) => {
            if (!allowDeletionSuggestions) return false;
            if (!item.id) return false;
            if (item.source === 'planner') return plannerIds.has(item.id);
            return boardIds.has(item.id);
          })
          .slice(0, 20)
      : [];

    if (!tasks.length && !deletions.length) {
      return res.status(502).json({ error: 'AI returned no usable suggestions.' });
    }

    return res.status(200).json({ tasks, deletions, usage: usageMeta });
  } catch (err: any) {
    console.error('planner/generate runtime crash:', err);
    return res.status(502).json({
      error: 'Planner generation failed before completion.',
      detail: String(err?.message || err),
      code: 'PLANNER_GENERATION_RUNTIME_ERROR',
    });
  }
}
