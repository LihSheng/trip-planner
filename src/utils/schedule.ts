import type { LocationCluster, Place, PlaceCategory, StopSchedule, TravelMode, TripDay } from '../types';
import type { LegRef } from '../domain/transit';
import { resolveLeg, type ResolvedLeg } from './routing';

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

export type NextAnchor =
  | {
    kind: 'leaveBy'; leaveAt: string; arriveBy: string; travelMinutes: number; mode: TravelMode; toPlaceId: string;
    /** Null when there is no current stop, so no leg leads to the next one. */
    leg: ResolvedLeg | null;
    /** Null as well when stops between current and next were skipped: only adjacent stops form a saved leg. */
    legRef: LegRef | null;
  }
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
  const adjacent = current !== undefined && day.placeIds[day.placeIds.indexOf(current.id) + 1] === next.id;
  const legRef = adjacent ? { dayId: day.id, fromPlaceId: current.id, toPlaceId: next.id } : null;
  return { kind: 'leaveBy', leaveAt: toTime(arriveMinutes - travelMinutes), arriveBy: toTime(arriveMinutes), travelMinutes, mode, toPlaceId: next.id, leg, legRef };
}
