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

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Missing OPENAI_API_KEY' });

    const cfg = getSupabaseServiceConfig();
    if (!cfg.ok) return res.status(503).json({ error: cfg.error, detail: cfg.detail || '' });
    const db = createClient(cfg.url, cfg.serviceKey);

    const body = parseBody(req.body);
    const projectId = asString(body?.projectId);
    const goal = asLimitedString(body?.goal, 1200);
    if (!projectId) return res.status(400).json({ error: 'Project id is required.' });
    if (!goal) return res.status(400).json({ error: 'Goal is required.' });

    const usageLimit = 5;
    let usageMeta = {
      used: 0,
      limit: usageLimit,
      unlimited: false,
      remaining: usageLimit as number | null,
    };

    const { data: projectData, error: projectError } = await db
      .from('projects')
      .select('id,ai_plan_usage_count,ai_plan_unlimited')
      .eq('id', projectId)
      .maybeSingle();
    if (projectError || !projectData) return res.status(404).json({ error: 'Project not found.' });

    const project = projectData as {
      id: string;
      ai_plan_usage_count?: number | null;
      ai_plan_unlimited?: boolean | null;
    };

    const { data: usageData, error: usageError } = await db.rpc('consume_project_ai_usage', {
      p_project_id: projectId,
      p_limit: usageLimit,
    });

    if (usageError) {
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
      const { error: updateError } = await db
        .from('projects')
        .update({ ai_plan_usage_count: nextUsed, updated_at: new Date().toISOString() })
        .eq('id', projectId);
      if (updateError) {
        return res.status(503).json({
          error: 'Failed to process AI usage limit.',
          detail: String(updateError.message || updateError.code || 'usage update failed'),
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

    const schema = {
      name: 'planner_tasks',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tasks: {
            type: 'array',
            minItems: 0,
            maxItems: 12,
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
            maxItems: 12,
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
    const OPENAI_TIMEOUT_MS = 20000;
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
          temperature: 0.2,
          response_format: {
            type: 'json_schema',
            json_schema: schema,
          },
          messages: [
            {
              role: 'system',
              content:
                'You are a project planning assistant. Return concise, actionable tasks. Avoid duplicates and keep output practical.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                today: new Date().toISOString().slice(0, 10),
                goal,
                additionalInstructions,
                deletionPolicy: allowDeletionSuggestions
                  ? 'You may suggest deletions only for stale or duplicate items from provided ids.'
                  : 'Do not suggest deletions; return an empty deletions array.',
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
        return res.status(504).json({ error: 'AI generation timed out. Please try again.', usage: usageMeta });
      }
      return res.status(502).json({
        error: 'OpenAI request failed before response.',
        detail: String(fetchError?.message || fetchError),
        usage: usageMeta,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const openAiRawText = await openaiRes.text();
    const raw = safeJsonParse(openAiRawText);
    if (!raw || typeof raw !== 'object') {
      return res.status(502).json({
        error: 'OpenAI returned a non-JSON response.',
        detail: openAiRawText.trim().slice(0, 240) || 'Upstream response could not be parsed.',
        usage: usageMeta,
      });
    }

    if (!openaiRes.ok) {
      return res.status(502).json({
        error: 'OpenAI request failed.',
        detail: (raw as any)?.error?.message || (raw as any)?.error || 'Unknown OpenAI error',
        usage: usageMeta,
      });
    }

    const content = normalizeMessageContent((raw as any)?.choices?.[0]?.message?.content);
    if (!content) return res.status(502).json({ error: 'OpenAI response was missing structured output.', usage: usageMeta });

    const parsed = parseStructuredJson(content);
    if (!parsed || !Array.isArray(parsed.tasks)) {
      return res.status(502).json({ error: 'Failed to parse AI planner output.', usage: usageMeta });
    }

    const tasks = parsed.tasks
      .map((task: any) => ({
        title: asLimitedString(task?.title, 180),
        description: asLimitedString(task?.description, 700),
        dueDate: normalizeDueDate(task?.dueDate),
      }))
      .filter((task: any) => task.title)
      .slice(0, 12);

    const deletions = Array.isArray(parsed.deletions)
      ? parsed.deletions
          .map((item: any) => ({
            source: item?.source === 'board' ? 'board' : 'planner',
            id: asLimitedString(item?.id, 120),
            title: asLimitedString(item?.title, 180),
            reason: asLimitedString(item?.reason, 300),
          }))
          .filter((item: any) => {
            if (!allowDeletionSuggestions) return false;
            if (!item.id) return false;
            if (item.source === 'planner') return plannerIds.has(item.id);
            return boardIds.has(item.id);
          })
          .slice(0, 12)
      : [];

    if (!tasks.length && !deletions.length) {
      return res.status(502).json({ error: 'AI returned no usable suggestions.', usage: usageMeta });
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
