import type { LocationCluster, Place, TravelMode, TripDay } from '../types';
import { isPlaceholder } from '../domain/place';
import type { LegRef } from '../domain/transit';
import { dayLegs, dayStops, resolveLeg, type ResolvedLeg } from './routing';
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

/** A projected time on the clock: past midnight wraps (24:30 is 00:30) instead of clamping to 23:59 like `toTime`. */
export function clockTime(minutes: number): string {
  return toTime(((Math.round(minutes) % 1440) + 1440) % 1440);
}

/** A stop's start as every surface shows it: an estimate is prefixed with `~`, as in the planner gutter. */
export function timingStartLabel(timing: StopTiming): string {
  return `${timing.source === 'estimated' ? '~' : ''}${clockTime(timing.start)}`;
}

/** A stop's time range, e.g. `~09:00–10:30`. */
export function timingLabel(timing: StopTiming): string {
  return `${timingStartLabel(timing)}–${clockTime(timing.end)}`;
}

export type NextAnchor =
  | {
    kind: 'leaveBy'; leaveAt: string; arriveBy: string; travelMinutes: number; mode: TravelMode; toPlaceId: string;
    /** True when the next stop's start is the projection's estimate rather than a planned time. */
    estimated: boolean;
    /** Null when there is no current stop, so no leg leads to the next one. */
    leg: ResolvedLeg | null;
    /** Null as well when real stops between current and next were skipped: only a planner leg has a saved route. */
    legRef: LegRef | null;
  }
  | { kind: 'opensAt'; opensAt: string; placeId: string }
  | { kind: 'none' };

/**
 * Today's next anchor, read from the day's projection so it shows the planner's times. When only
 * placeholders sit between current and next, the leg is the planner's leg into next (bridged from
 * the last real stop), so its minutes and saved route are the planner's too.
 */
export function nextAnchor(
  day: TripDay,
  { stops, legs }: DayProjection,
  clusters: LocationCluster[],
  currentPlaceId: string | null,
  nextPlaceId: string | null,
): NextAnchor {
  const nextIndex = stops.findIndex((stop) => stop.place.id === nextPlaceId);
  if (nextIndex < 0) return { kind: 'none' };
  const { place: next, timing } = stops[nextIndex];
  const currentIndex = stops.findIndex((stop) => stop.place.id === currentPlaceId);
  const estimated = timing.source === 'estimated';

  if (currentIndex < 0) {
    // With nowhere to leave from, an estimate chained from the day start says little; the opening time says more.
    const opensAt = next.openingHours?.opensAt;
    if (estimated) return toMinutes(opensAt) !== null ? { kind: 'opensAt', opensAt: opensAt!, placeId: next.id } : { kind: 'none' };
    const at = toTime(timing.start);
    return { kind: 'leaveBy', leaveAt: at, arriveBy: at, estimated, travelMinutes: 0, mode: day.travelMode ?? 'public', toPlaceId: next.id, leg: null, legRef: null };
  }

  const plannerLeg = currentIndex < nextIndex && stops.slice(currentIndex + 1, nextIndex).every((stop) => isPlaceholder(stop.place));
  const leg = plannerLeg ? legs[nextIndex - 1] : resolveLeg(day, clusters, stops[currentIndex].place, next);
  const legRef = plannerLeg ? { dayId: day.id, fromPlaceId: leg.from.id, toPlaceId: leg.to.id } : null;
  const travelMinutes = leg.minutes ?? 0;
  return {
    kind: 'leaveBy', leaveAt: toTime(timing.start - travelMinutes), arriveBy: toTime(timing.start), estimated,
    travelMinutes, mode: leg.mode, toPlaceId: next.id, leg, legRef,
  };
}
