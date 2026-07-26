import type { Place, PlaceCategory, StopSchedule, TravelMode, TripDay } from '../types';

const DEFAULT_DURATIONS: Record<PlaceCategory, number> = {
  Landmark: 90,
  Food: 60,
  Nature: 120,
  Culture: 90,
  Shopping: 90,
  Relaxation: 120,
  Accommodation: 30,
};

const TRAVEL_SPEEDS_KMH: Record<TravelMode, number> = {
  public: 24,
  walk: 4.5,
  bike: 14,
  car: 45,
  taxi: 42,
  other: 20,
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

function distanceKm(from: Place, to: Place) {
  const radians = Math.PI / 180;
  const latitudeDelta = (to.latitude - from.latitude) * radians;
  const longitudeDelta = (to.longitude - from.longitude) * radians;
  const latitude = from.latitude * radians;
  const targetLatitude = to.latitude * radians;
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitude) * Math.cos(targetLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function estimateTravelMinutes(from: Place, to: Place, mode: TravelMode = 'public') {
  if (from.type === 'placeholder' || to.type === 'placeholder') return 0;
  const roadFactor = mode === 'walk' ? 1.15 : 1.3;
  return Math.max(5, Math.round((distanceKm(from, to) * roadFactor / TRAVEL_SPEEDS_KMH[mode]) * 60));
}

export function scheduleFor(day: TripDay, place: Place): StopSchedule {
  return {
    durationMinutes: defaultDuration(place.category),
    ...day.stopSchedules?.[place.id],
  };
}

export function dayWarnings(day: TripDay, places: Place[]) {
  const warnings = new Map<string, string[]>();
  let previous: { place: Place; endsAt: number } | null = null;

  for (const place of places) {
    const schedule = scheduleFor(day, place);
    const startsAt = toMinutes(schedule.startTime);
    if (startsAt === null) continue;
    const duration = schedule.durationMinutes ?? defaultDuration(place.category);
    const closesAt = toMinutes(place.openingHours?.closesAt);
    const opensAt = toMinutes(place.openingHours?.opensAt);
    const placeWarnings: string[] = [];
    if ((opensAt !== null && startsAt < opensAt) || (closesAt !== null && startsAt + duration > closesAt)) placeWarnings.push('Outside opening hours');
    if (previous && startsAt < previous.endsAt + estimateTravelMinutes(previous.place, place, day.travelMode)) placeWarnings.push('Insufficient travel time');
    if (placeWarnings.length) warnings.set(place.id, placeWarnings);
    previous = { place, endsAt: startsAt + duration };
  }

  return warnings;
}

export function dayWarningCount(day: TripDay, places: Place[]) {
  return [...dayWarnings(day, places).values()].reduce((total, warnings) => total + warnings.length, 0);
}
