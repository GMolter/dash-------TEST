import { describe, expect, it } from 'vitest';
import {
  buildClassInstances,
  CLASSDASH_BUFFER_MINUTES,
  ClassDashSettings,
  ClassMeeting,
  estimateWalkingMinutes,
  getInstanceStatus,
  haversineKilometers,
} from './model';

const settings: ClassDashSettings = {
  user_id: 'user-1',
  dorm_name: 'Home',
  dorm_lat: 39.1688,
  dorm_lng: -86.5186,
  walking_speed_kph: 4.8,
};

const meeting: ClassMeeting = {
  id: 'class-1',
  user_id: 'user-1',
  code: 'TEST-101',
  title: 'Testing',
  section: '',
  days: [3],
  start_time: '09:00:00',
  end_time: '10:00:00',
  location_name: 'Classroom',
  location_lat: 39.1732,
  location_lng: -86.5231,
  term_start: '2026-08-01',
  term_end: '2026-12-31',
  sort_order: 0,
};

describe('ClassDash schedule model', () => {
  it('estimates walking time from the two selected map points', () => {
    const distance = haversineKilometers(
      { lat: settings.dorm_lat, lng: settings.dorm_lng },
      { lat: meeting.location_lat, lng: meeting.location_lng },
    );
    expect(distance).toBeGreaterThan(0.5);
    expect(distance).toBeLessThan(1);
    expect(estimateWalkingMinutes(
      { lat: settings.dorm_lat, lng: settings.dorm_lng },
      { lat: meeting.location_lat, lng: meeting.location_lng },
    )).toBeGreaterThan(5);
  });

  it('adds the five-minute buffer to the calculated walk', () => {
    const now = new Date(2026, 8, 2, 8, 0, 0);
    const [instance] = buildClassInstances(now, [meeting], settings);
    expect(instance).toBeDefined();
    const leadMinutes = (instance.start.getTime() - instance.leaveAt.getTime()) / 60_000;
    expect(leadMinutes).toBe(instance.walkMinutes + CLASSDASH_BUFFER_MINUTES);
  });

  it('always uses the standard 12.5 minute per kilometer pace', () => {
    const now = new Date(2026, 8, 2, 8, 0, 0);
    const [slowPreference] = buildClassInstances(now, [meeting], { ...settings, walking_speed_kph: 1 });
    const [fastPreference] = buildClassInstances(now, [meeting], { ...settings, walking_speed_kph: 10 });
    expect(slowPreference.walkMinutes).toBe(fastPreference.walkMinutes);
  });

  it('reports waiting, leave-now, and in-class states', () => {
    const now = new Date(2026, 8, 2, 8, 0, 0);
    const [instance] = buildClassInstances(now, [meeting], settings);
    expect(getInstanceStatus(instance, new Date(instance.leaveAt.getTime() - 1))).toBe('waiting');
    expect(getInstanceStatus(instance, instance.leaveAt)).toBe('leave-now');
    expect(getInstanceStatus(instance, instance.start)).toBe('in-class');
  });

  it('honors semester boundaries', () => {
    const afterTerm = new Date(2027, 0, 6, 8, 0, 0);
    expect(buildClassInstances(afterTerm, [meeting], settings)).toHaveLength(0);
  });

  it('walks from the previous classroom when the gap is 45 minutes or less', () => {
    const nextMeeting: ClassMeeting = {
      ...meeting,
      id: 'class-2',
      code: 'TEST-202',
      start_time: '10:45:00',
      end_time: '11:30:00',
      location_name: 'Next Classroom',
      location_lat: 39.175,
      location_lng: -86.521,
      sort_order: 1,
    };
    const instances = buildClassInstances(new Date(2026, 8, 2, 8, 0, 0), [meeting, nextMeeting], settings);
    expect(instances[1].originType).toBe('class');
    expect(instances[1].originName).toBe('Classroom');
    expect(instances[1].gapMinutes).toBe(45);
    expect(instances[1].walkMinutes).toBe(estimateWalkingMinutes(
      { lat: meeting.location_lat, lng: meeting.location_lng },
      { lat: nextMeeting.location_lat, lng: nextMeeting.location_lng },
    ));
  });

  it('returns to the dorm as the assumed origin when the gap exceeds 45 minutes', () => {
    const laterMeeting: ClassMeeting = {
      ...meeting,
      id: 'class-3',
      code: 'TEST-303',
      start_time: '10:46:00',
      end_time: '11:30:00',
      location_name: 'Later Classroom',
      location_lat: 39.18,
      location_lng: -86.51,
      sort_order: 1,
    };
    const instances = buildClassInstances(new Date(2026, 8, 2, 8, 0, 0), [meeting, laterMeeting], settings);
    expect(instances[1].gapMinutes).toBe(46);
    expect(instances[1].originType).toBe('home');
    expect(instances[1].originName).toBe('Home');
  });
});
