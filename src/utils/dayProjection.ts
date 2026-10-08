import type { LocationCluster, Place, TripDay } from '../types';
import { resolveLeg, type ResolvedLeg } from './routing';
import { defaultDuration, scheduleFor, toMinutes } from './schedule';

export type StopTiming = { start: number; end: number; source: 'planned' | 'estimated' };
export type ScheduleWarning = { kind: 'outsideHours' } | { kind: 'shortTravel'; shortByMinutes: number };
export type DayProjection = {
  stops: { place: Place; timing: StopTiming; warnings: ScheduleWarning[] }[];
  /** legs[i] sits between stops[i] and stops[i + 1]. */
  legs: ResolvedLeg[];
};

const DEFAULT_DAY_START = 9 * 60;

/** The single source of timing for a day: planned anchors from stored start times, estimates in between. */
export function projectDay(day: TripDay, places: Place[], clusters: LocationCluster[]): DayProjection {
  const placesById = new Map(places.map((place) => [place.id, place]));
  const ordered = day.placeIds.flatMap((id) => placesById.get(id) ?? []);
  const legs = ordered.slice(1).map((place, i) => resolveLeg(day, clusters, ordered[i], place));
  const stops: DayProjection['stops'] = [];

  ordered.forEach((place, i) => {
    const schedule = scheduleFor(day, place);
    const planned = toMinutes(schedule.startTime);
    const previous = stops[i - 1];
    const earliest = previous ? previous.timing.end + (legs[i - 1].minutes ?? 0) : toMinutes(day.startTime) ?? DEFAULT_DAY_START;
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
