export type Coordinates = { lat: number; lng: number };

export type ClassDashSettings = {
  user_id: string;
  dorm_name: string;
  dorm_lat: number;
  dorm_lng: number;
  walking_speed_kph: number;
};

export type ClassMeeting = {
  id: string;
  user_id: string;
  code: string;
  title: string;
  section: string;
  days: number[];
  start_time: string;
  end_time: string;
  location_name: string;
  location_lat: number;
  location_lng: number;
  term_start: string | null;
  term_end: string | null;
  sort_order: number;
};

export type ClassInstance = {
  meeting: ClassMeeting;
  date: Date;
  start: Date;
  end: Date;
  leaveAt: Date;
  walkMinutes: number;
  dayOffset: number;
};

export type ClassDashStatus = 'waiting' | 'leave-now' | 'in-class';

export const CLASSDASH_BUFFER_MINUTES = 5;
export const DEFAULT_WALKING_SPEED_KPH = 4.8;
// Campus paths are rarely straight lines. This makes a safe key-free estimate.
export const WALKING_ROUTE_FACTOR = 1.2;

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function haversineKilometers(from: Coordinates, to: Coordinates) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latDelta = radians(to.lat - from.lat);
  const lngDelta = radians(to.lng - from.lng);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateWalkingMinutes(from: Coordinates, to: Coordinates, speedKph = DEFAULT_WALKING_SPEED_KPH) {
  const safeSpeed = Math.min(10, Math.max(1, speedKph));
  const adjustedDistance = haversineKilometers(from, to) * WALKING_ROUTE_FACTOR;
  return Math.max(1, Math.ceil((adjustedDistance / safeSpeed) * 60));
}

function dateAtTime(date: Date, time: string) {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildClassInstances(
  now: Date,
  meetings: ClassMeeting[],
  settings: ClassDashSettings,
  daysAhead = 8,
) {
  const result: ClassInstance[] = [];
  for (let offset = 0; offset < daysAhead; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const dateKey = localDateKey(date);

    for (const meeting of meetings) {
      if (!meeting.days.includes(date.getDay())) continue;
      if (meeting.term_start && dateKey < meeting.term_start) continue;
      if (meeting.term_end && dateKey > meeting.term_end) continue;

      const start = dateAtTime(date, meeting.start_time);
      const end = dateAtTime(date, meeting.end_time);
      const walkMinutes = estimateWalkingMinutes(
        { lat: settings.dorm_lat, lng: settings.dorm_lng },
        { lat: meeting.location_lat, lng: meeting.location_lng },
        Number(settings.walking_speed_kph),
      );
      const leaveAt = new Date(start.getTime() - (walkMinutes + CLASSDASH_BUFFER_MINUTES) * 60_000);
      result.push({ meeting, date, start, end, leaveAt, walkMinutes, dayOffset: offset });
    }
  }
  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function getInstanceStatus(instance: ClassInstance, now: Date): ClassDashStatus {
  if (now >= instance.start) return 'in-class';
  if (now >= instance.leaveAt) return 'leave-now';
  return 'waiting';
}

export function formatCountdown(milliseconds: number) {
  let seconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

