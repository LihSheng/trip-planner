import type { Place, PlaceCategory, StopSchedule, TripDay } from '../types';

const DEFAULT_DURATIONS: Record<PlaceCategory, number> = {
  Landmark: 90,
  Food: 60,
  Nature: 120,
  Culture: 90,
  Shopping: 90,
  Relaxation: 120,
  Accommodation: 30,
  Airport: 90,
  Station: 30,
  Transit: 30,
};

export function defaultDuration(category: PlaceCategory) {
  return DEFAULT_DURATIONS[category];
}

export function toMinutes(time?: string) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function toTime(minutes: number) {
  const value = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function scheduleFor(day: TripDay, place: Place): StopSchedule {
  return {
    durationMinutes: defaultDuration(place.category),
    ...day.stopSchedules?.[place.id],
  };
}

/** The stop's planned leave time in minutes of day, or null when it has no start time. */
export function plannedLeaveMinutes(day: TripDay, place: Place): number | null {
  const schedule = scheduleFor(day, place);
  const startsAt = toMinutes(schedule.startTime);
  return startsAt === null ? null : startsAt + (schedule.durationMinutes ?? defaultDuration(place.category));
}
