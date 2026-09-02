export type IcsClassMeetingDraft = {
  code: string;
  title: string;
  section: string;
  days: number[];
  start_time: string;
  end_time: string;
  location_name: string;
  term_start: string;
  term_end: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
};

type ParsedIcsDate = {
  date: Date;
  dateKey: string;
  time: string;
  weekday: number;
};

const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function unescapeIcs(value: string) {
  return value.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

function parseIcsDate(value: string): ParsedIcsDate | null {
  const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00', utc] = match;
  const date = utc
    ? new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)))
    : new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return {
    date,
    dateKey: localDateKey(date),
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    weekday: date.getDay(),
  };
}

function parseIcsDateKey(value: string) {
  const parsed = parseIcsDate(value);
  if (parsed) return parsed.dateKey;
  const dateOnly = value.trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  return dateOnly ? `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}` : '';
}

function propertyValue(lines: string[], property: string) {
  const line = lines.find((candidate) => candidate.slice(0, candidate.indexOf(':')).split(';')[0].toUpperCase() === property);
  if (!line) return '';
  return unescapeIcs(line.slice(line.indexOf(':') + 1));
}

function rruleValues(value: string) {
  return Object.fromEntries(value.split(';').map((part) => {
    const separator = part.indexOf('=');
    return separator < 0 ? [part.toUpperCase(), ''] : [part.slice(0, separator).toUpperCase(), part.slice(separator + 1)];
  }));
}

function courseParts(summary: string) {
  const match = summary.match(/^([A-Z]{2,}(?:-[A-Z])?[- ]?\d{2,4}[A-Z]?)(?:\s*[:–—-]\s*|\s+)(.*)$/i);
  if (!match) return { code: summary, title: '' };
  return { code: match[1].trim(), title: match[2].trim() };
}

export function parseClassScheduleIcs(content: string): IcsClassMeetingDraft[] {
  const unfolded = content.replace(/\r?\n[ \t]/g, '');
  const eventBlocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi) || [];
  const grouped = new Map<string, IcsClassMeetingDraft>();

  for (const block of eventBlocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const summary = propertyValue(lines, 'SUMMARY');
    const location = propertyValue(lines, 'LOCATION');
    const start = parseIcsDate(propertyValue(lines, 'DTSTART'));
    const end = parseIcsDate(propertyValue(lines, 'DTEND'));
    if (!summary || !start || !end || end.date <= start.date) continue;

    const rule = rruleValues(propertyValue(lines, 'RRULE'));
    const recurrenceDays = rule.BYDAY
      ? rule.BYDAY.split(',').map((day) => WEEKDAYS[day.slice(-2).toUpperCase()]).filter((day) => day !== undefined)
      : [start.weekday];
    const until = rule.UNTIL ? parseIcsDateKey(rule.UNTIL) : '';
    const { code, title } = courseParts(summary);
    const key = `${summary.toLocaleLowerCase()}|${location.toLocaleLowerCase()}|${start.time}|${end.time}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.days = [...new Set([...existing.days, ...recurrenceDays])].sort();
      existing.term_start = existing.term_start < start.dateKey ? existing.term_start : start.dateKey;
      const occurrenceEnd = until || start.dateKey;
      existing.term_end = existing.term_end > occurrenceEnd ? existing.term_end : occurrenceEnd;
      continue;
    }
    grouped.set(key, {
      code,
      title,
      section: '',
      days: [...new Set(recurrenceDays)].sort(),
      start_time: start.time,
      end_time: end.time,
      location_name: location,
      term_start: start.dateKey,
      term_end: until || (rule.FREQ ? '' : start.dateKey),
      confidence: location ? 'high' : 'medium',
      notes: location ? 'Imported from calendar. Verify the details and map pin.' : 'Calendar event had no location. Add the building and map pin.',
    });
  }

  return [...grouped.values()]
    .filter((meeting) => meeting.days.length > 0 && meeting.start_time < meeting.end_time)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}
