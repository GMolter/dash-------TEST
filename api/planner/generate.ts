export const config = { runtime: 'nodejs' };

type PlannerInputItem = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  due_date?: unknown;
  completed?: unknown;
};

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
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
    .slice(0, 100)
    .map((item) => {
      const row = (item || {}) as PlannerInputItem;
      return {
        id: asString(row.id),
        title: asString(row.title),
        description: asString(row.description),
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
  }

  const goal = asString(req.body?.goal);
  if (!goal) {
    return res.status(400).json({ error: 'Goal is required.' });
  }

  const additionalInstructions = asString(req.body?.additionalInstructions);
  const allowDeletionSuggestions = Boolean(req.body?.allowDeletionSuggestions);
  const plannerTasks = sanitizeContextItems(req.body?.context?.plannerTasks);
  const boardCards = sanitizeContextItems(req.body?.context?.boardCards);
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

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
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

    const raw = await openaiRes.json();
    if (!openaiRes.ok) {
      return res.status(502).json({
        error: 'OpenAI request failed.',
        detail: raw?.error?.message || raw?.error || 'Unknown OpenAI error',
      });
    }

    const content = raw?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return res.status(502).json({ error: 'OpenAI response was missing structured output.' });
    }

    const parsed = safeJsonParse(content);
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

    return res.status(200).json({ tasks, deletions });
  } catch (err: any) {
    console.error('planner/generate runtime crash:', err);
    return res.status(500).json({ error: 'Internal error', detail: String(err?.message || err) });
  }
}
