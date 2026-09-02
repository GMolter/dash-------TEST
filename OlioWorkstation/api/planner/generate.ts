import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceConfig } from '../_utils/supabaseConfig.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

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

function bearerToken(req: any) {
  const raw = String(req.headers?.authorization || req.headers?.Authorization || '');
  return raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() || null : null;
}

function normalizeResponseOutput(raw: any) {
  if (!Array.isArray(raw?.output)) return null;
  const text = raw.output
    .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .filter((part: any) => part?.type === 'output_text' && typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('\n')
    .trim();
  return text || null;
}

async function handleSyllabusImport(req: any, res: any, body: any, apiKey: string) {
  res.setHeader('Cache-Control', 'no-store');
  const serviceConfig = getSupabaseServiceConfig();
  if (serviceConfig.ok === false) return res.status(503).json({ error: 'Account verification is unavailable.' });
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Sign in before importing a syllabus.' });
  const supabase = createClient(serviceConfig.url, serviceConfig.serviceKey);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: 'Your session expired. Sign in again.' });

  const fileName = asLimitedString(body?.fileName, 180);
  const fileData = asString(body?.fileData);
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const allowedExtensions = new Set(['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt']);
  if (!fileName || !allowedExtensions.has(extension)) return res.status(400).json({ error: 'Use a PDF, Word document, RTF, ODT, Markdown, or text file.' });
  if (!/^data:[^;,]*;base64,[a-z0-9+/=\r\n]+$/i.test(fileData)) return res.status(400).json({ error: 'The syllabus file was not encoded correctly.' });
  if (fileData.length > 4_200_000) return res.status(413).json({ error: 'That syllabus is over 3 MB. Upload a smaller file.' });

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      meetings: {
        type: 'array',
        minItems: 0,
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            code: { type: 'string' },
            title: { type: 'string' },
            section: { type: 'string' },
            days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, uniqueItems: true },
            startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
            endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
            locationName: { type: 'string' },
            termStart: { anyOf: [{ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, { type: 'null' }] },
            termEnd: { anyOf: [{ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, { type: 'null' }] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            notes: { type: 'string' },
          },
          required: ['code', 'title', 'section', 'days', 'startTime', 'endTime', 'locationName', 'termStart', 'termEnd', 'confidence', 'notes'],
        },
      },
    },
    required: ['meetings'],
  };

  const fileItem: Record<string, unknown> = { type: 'input_file', filename: fileName, file_data: fileData };
  if (extension === 'pdf') fileItem.detail = 'low';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45_000);
  let openaiRes: Response;
  try {
    openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_SYLLABUS_MODEL || 'gpt-4.1-mini',
        store: false,
        input: [{
          role: 'user',
          content: [
            fileItem,
            {
              type: 'input_text',
              text: [
                'Extract recurring in-person class meeting patterns from this syllabus.',
                'Return one meeting for each distinct lecture, lab, discussion, or recitation pattern.',
                'Use day numbers 0=Sunday through 6=Saturday and 24-hour HH:MM times.',
                'Do not treat office hours, exams, assignment deadlines, or one-off events as class meetings.',
                'If a field is missing, use an empty string or null. Explain ambiguity briefly in notes.',
              ].join(' '),
            },
          ],
        }],
        text: { format: { type: 'json_schema', name: 'classdash_syllabus', strict: true, schema } },
      }),
    });
  } catch (fetchError: any) {
    if (fetchError?.name === 'AbortError') return res.status(504).json({ error: 'Syllabus analysis timed out. Try a smaller file.' });
    return res.status(502).json({ error: 'Syllabus analysis could not start.' });
  } finally {
    clearTimeout(timeoutId);
  }

  const rawText = await openaiRes.text();
  const raw = safeJsonParse(rawText);
  if (!raw || typeof raw !== 'object') return res.status(502).json({ error: 'The syllabus service returned an invalid response.' });
  if (!openaiRes.ok) return res.status(502).json({ error: (raw as any)?.error?.message || 'The syllabus could not be analyzed.' });
  const content = normalizeResponseOutput(raw);
  const parsed = content ? parseStructuredJson(content) : null;
  if (!parsed || !Array.isArray(parsed.meetings)) return res.status(502).json({ error: 'No structured class information was returned.' });

  const meetings = parsed.meetings
    .map((meeting: any) => ({
      code: asLimitedString(meeting?.code, 80),
      title: asLimitedString(meeting?.title, 180),
      section: asLimitedString(meeting?.section, 100),
      days: Array.isArray(meeting?.days) ? [...new Set(meeting.days.filter((day: unknown) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6))].sort() : [],
      start_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(meeting?.startTime) ? meeting.startTime : '',
      end_time: /^([01]\d|2[0-3]):[0-5]\d$/.test(meeting?.endTime) ? meeting.endTime : '',
      location_name: asLimitedString(meeting?.locationName, 220),
      term_start: normalizeDueDate(meeting?.termStart) || '',
      term_end: normalizeDueDate(meeting?.termEnd) || '',
      confidence: ['high', 'medium', 'low'].includes(meeting?.confidence) ? meeting.confidence : 'low',
      notes: asLimitedString(meeting?.notes, 300),
    }))
    .filter((meeting: any) => meeting.days.length > 0 && meeting.start_time && meeting.end_time)
    .slice(0, 8);

  return res.status(200).json({ meetings });
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Missing OPENAI_API_KEY' });

    const body = parseBody(req.body);
    if (body?.mode === 'classdash-syllabus') return handleSyllabusImport(req, res, body, apiKey);
    const goal = asLimitedString(body?.goal, 1200);
    const projectId = asString(body?.projectId);
    if (!goal) return res.status(400).json({ error: 'Goal is required.' });
    if (!projectId) return res.status(400).json({ error: 'Project id is required.' });

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
        return res.status(504).json({ error: 'AI generation timed out. Please try again.' });
      }
      return res.status(502).json({
        error: 'OpenAI request failed before response.',
        detail: String(fetchError?.message || fetchError),
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
      });
    }

    if (!openaiRes.ok) {
      return res.status(502).json({
        error: 'OpenAI request failed.',
        detail: (raw as any)?.error?.message || (raw as any)?.error || 'Unknown OpenAI error',
      });
    }

    const content = normalizeMessageContent((raw as any)?.choices?.[0]?.message?.content);
    if (!content) return res.status(502).json({ error: 'OpenAI response was missing structured output.' });

    const parsed = parseStructuredJson(content);
    if (!parsed || !Array.isArray(parsed.tasks)) {
      return res.status(502).json({ error: 'Failed to parse AI planner output.' });
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
      return res.status(502).json({ error: 'AI returned no usable suggestions.' });
    }

    return res.status(200).json({ tasks, deletions });
  } catch (err: any) {
    console.error('planner/generate runtime crash:', err);
    return res.status(502).json({
      error: 'Planner generation failed before completion.',
      detail: String(err?.message || err),
      code: 'PLANNER_GENERATION_RUNTIME_ERROR',
    });
  }
}
