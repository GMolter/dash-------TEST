import { describe, expect, it } from 'vitest';
import { parseClassScheduleIcs } from './ics';

describe('ClassDash ICS import', () => {
  it('extracts a recurring weekly class and its term dates', () => {
    const calendar = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:INFO-I101: Introduction to Informatics',
      'LOCATION:Luddy Hall 0117',
      'DTSTART;TZID=America/Indiana/Indianapolis:20260902T090000',
      'DTEND;TZID=America/Indiana/Indianapolis:20260902T101500',
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261210T235959Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const [meeting] = parseClassScheduleIcs(calendar);
    expect(meeting).toMatchObject({
      code: 'INFO-I101',
      title: 'Introduction to Informatics',
      days: [1, 3],
      start_time: '09:00',
      end_time: '10:15',
      location_name: 'Luddy Hall 0117',
      term_start: '2026-09-02',
    });
    expect(meeting.term_end).toBeTruthy();
  });

  it('groups separate calendar occurrences into one weekly meeting pattern', () => {
    const event = (date: string) => [
      'BEGIN:VEVENT',
      'SUMMARY:MATH-M211 Calculus I',
      'LOCATION:Swain East 105',
      `DTSTART:${date}T133000`,
      `DTEND:${date}T142000`,
      'END:VEVENT',
    ].join('\n');
    const calendar = `BEGIN:VCALENDAR\n${event('20260901')}\n${event('20260903')}\n${event('20260908')}\nEND:VCALENDAR`;

    const [meeting] = parseClassScheduleIcs(calendar);
    expect(meeting.days).toEqual([2, 4]);
    expect(meeting.term_start).toBe('2026-09-01');
    expect(meeting.term_end).toBe('2026-09-08');
  });
});
