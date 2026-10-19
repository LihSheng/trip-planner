import type { LocationCluster, Place, PlaceCategory, StopSchedule, TravelMode, TripDay } from '../types';
import { resolveLeg } from './routing';

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

export function dayWarnings(day: TripDay, places: Place[], clusters: LocationCluster[]) {
  const warnings = new Map<string, string[]>();
  const legs = places.slice(1).map((place, i) => resolveLeg(day, clusters, places[i], place));
  let previous: { index: number; endsAt: number } | null = null;

  for (const [index, place] of places.entries()) {
    const schedule = scheduleFor(day, place);
    const startsAt = toMinutes(schedule.startTime);
    if (startsAt === null) continue;
    const duration = schedule.durationMinutes ?? defaultDuration(place.category);
    const closesAt = toMinutes(place.openingHours?.closesAt);
    const opensAt = toMinutes(place.openingHours?.opensAt);
    const placeWarnings: string[] = [];
    if ((opensAt !== null && startsAt < opensAt) || (closesAt !== null && startsAt + duration > closesAt)) placeWarnings.push('Outside opening hours');
    if (previous) {
      const travel = legs.slice(previous.index, index).reduce((total, leg) => total + (leg.minutes ?? 0), 0);
      if (startsAt < previous.endsAt + travel) placeWarnings.push('Insufficient travel time');
    }
    if (placeWarnings.length) warnings.set(place.id, placeWarnings);
    previous = { index, endsAt: startsAt + duration };
  }

  return warnings;
}

export function dayWarningCount(day: TripDay, places: Place[], clusters: LocationCluster[]) {
  return [...dayWarnings(day, places, clusters).values()].reduce((total, warnings) => total + warnings.length, 0);
}

/**
 * Fills start times for the untimed stops after `fromPlaceId`, chaining stop durations and resolved
 * leg minutes, and stops at the next stop that already has a time.
 */
export function cascadeStartTimes(day: TripDay, placesById: Map<string, Place>, clusters: LocationCluster[], fromPlaceId: string): TripDay {
  const startIndex = day.placeIds.indexOf(fromPlaceId);
  let previousPlace = placesById.get(fromPlaceId);
  const fromStart = toMinutes(day.stopSchedules?.[fromPlaceId]?.startTime);
  if (startIndex < 0 || !previousPlace || fromStart === null) return day;

  const stopSchedules = { ...day.stopSchedules };
  let nextStart = fromStart + (stopSchedules[fromPlaceId]?.durationMinutes ?? defaultDuration(previousPlace.category));
  for (const nextPlaceId of day.placeIds.slice(startIndex + 1)) {
    const nextPlace = placesById.get(nextPlaceId);
    if (!nextPlace) continue;
    nextStart += resolveLeg(day, clusters, previousPlace, nextPlace).minutes ?? 0;
    if (stopSchedules[nextPlaceId]?.startTime) break;
    const durationMinutes = stopSchedules[nextPlaceId]?.durationMinutes ?? defaultDuration(nextPlace.category);
    stopSchedules[nextPlaceId] = { ...stopSchedules[nextPlaceId], startTime: toTime(nextStart), durationMinutes };
    nextStart += durationMinutes;
    previousPlace = nextPlace;
  }
  return { ...day, stopSchedules };
}

export type NextAnchor =
  | { kind: 'leaveBy'; leaveAt: string; arriveBy: string; travelMinutes: number; mode: TravelMode; toPlaceId: string }
  | { kind: 'opensAt'; opensAt: string; placeId: string }
  | { kind: 'none' };

export function nextAnchor(day: TripDay, clusters: LocationCluster[], orderedPlaces: Place[], currentPlaceId: string | null, nextPlaceId: string | null): NextAnchor {
  const next = orderedPlaces.find((place) => place.id === nextPlaceId);
  if (!next) return { kind: 'none' };
  const current = orderedPlaces.find((place) => place.id === currentPlaceId);
  const schedule = scheduleFor(day, next);
  const closesAt = toMinutes(next.openingHours?.closesAt);
  const arriveMinutes = toMinutes(schedule.startTime)
    ?? (closesAt !== null ? closesAt - (schedule.durationMinutes ?? defaultDuration(next.category)) : null);

  if (arriveMinutes === null) {
    const opensAt = next.openingHours?.opensAt;
    return !current && toMinutes(opensAt) !== null ? { kind: 'opensAt', opensAt: opensAt!, placeId: next.id } : { kind: 'none' };
  }

  const leg = current ? resolveLeg(day, clusters, current, next) : null;
  const mode = leg?.mode ?? day.travelMode ?? 'public';
  const travelMinutes = leg?.minutes ?? 0;
  return { kind: 'leaveBy', leaveAt: toTime(arriveMinutes - travelMinutes), arriveBy: toTime(arriveMinutes), travelMinutes, mode, toPlaceId: next.id };
}
