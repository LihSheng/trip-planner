import type { LocationCluster, Place, TripDay } from '../types';
import { dayLegs, dayStops, type ResolvedLeg } from './routing';
import { defaultDuration, scheduleFor, toMinutes, toTime } from './schedule';

export type StopTiming = { start: number; end: number; source: 'planned' | 'estimated' };
export type ScheduleWarning = { kind: 'outsideHours' } | { kind: 'shortTravel'; shortByMinutes: number };
export type ProjectedStop = { place: Place; timing: StopTiming; warnings: ScheduleWarning[] };
export type DayProjection = {
  stops: ProjectedStop[];
  /** legs[i] sits between stops[i] and stops[i + 1], from dayLegs. */
  legs: ResolvedLeg[];
};

const DEFAULT_DAY_START = 9 * 60;

/**
 * The single source of timing for a day. A stored start time is a planned anchor; every other stop
 * starts at the previous stop's end plus the leg minutes. Warnings come from the same pass.
 * `places` may hold more than the day's stops and in any order.
 */
export function projectDay(day: TripDay, places: Place[], clusters: LocationCluster[]): DayProjection {
  const placesById = new Map(places.map((place) => [place.id, place]));
  const legs = dayLegs(day, placesById, clusters);
  const stops: ProjectedStop[] = [];

  dayStops(day, placesById).forEach((place, i) => {
    const schedule = scheduleFor(day, place);
    const planned = toMinutes(schedule.startTime);
    const previous = stops[i - 1];
    const earliest = previous
      ? previous.timing.end + (legs[i - 1].minutes ?? 0)
      : toMinutes(day.startTime) ?? DEFAULT_DAY_START;
    const start = planned ?? earliest;
    const end = start + (schedule.durationMinutes ?? defaultDuration(place.category));
    const warnings: ScheduleWarning[] = [];
    const opensAt = toMinutes(place.openingHours?.opensAt);
    const closesAt = toMinutes(place.openingHours?.closesAt);
    if ((opensAt !== null && start < opensAt) || (closesAt !== null && end > closesAt)) warnings.push({ kind: 'outsideHours' });
    if (previous && planned !== null && planned < earliest) warnings.push({ kind: 'shortTravel', shortByMinutes: earliest - planned });
    stops.push({ place, timing: { start, end, source: planned === null ? 'estimated' : 'planned' }, warnings });
  });

  return { stops, legs };
}

/**
 * Stores the projected start of each estimated stop after `placeId`, up to the next planned one, so
 * stored and displayed times agree. Returns `day` itself when `placeId` has no start time.
 */
export function storeProjectedStarts(day: TripDay, places: Place[], clusters: LocationCluster[], placeId: string): TripDay {
  const { stops } = projectDay(day, places, clusters);
  const editedIndex = stops.findIndex((stop) => stop.place.id === placeId);
  if (editedIndex < 0 || stops[editedIndex].timing.source !== 'planned') return day;
  const stopSchedules = { ...day.stopSchedules };
  for (const { place, timing } of stops.slice(editedIndex + 1)) {
    if (timing.source === 'planned') break;
    const durationMinutes = stopSchedules[place.id]?.durationMinutes ?? defaultDuration(place.category);
    stopSchedules[place.id] = { ...stopSchedules[place.id], startTime: toTime(timing.start), durationMinutes };
  }
  return { ...day, stopSchedules };
}
