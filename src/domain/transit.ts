import type { Place, TravelMode, TripDay } from '../types';
import { distanceMeters } from './locationCluster';
import { isPlaceholder } from './place';

export interface LatLng { lat: number; lng: number }

export type TransitProviderId = 'transitous' | 'mock';

/** Exhaustive on purpose: a new kind should fail the build wherever kinds are labelled. */
export type TransitStepKind = 'walk' | 'bus' | 'tram' | 'metro' | 'rail' | 'highSpeedRail' | 'ferry' | 'cableCar' | 'other';

export interface TransitStep {
  kind: TransitStepKind;
  minutes: number;
  /** Provider-verbatim line name. Absent for walk. */
  line?: string;
  fromStop?: string;
  toStop?: string;
  stopCount?: number;
  distanceMeters?: number;
}

export interface TransitOption {
  /**
   * Ride sequence such as "metro:Red>bus:307", or "walk". Unique within a lookup.
   * Not named `id`: mergeTripState merges id-keyed arrays element by element, and options must merge whole.
   */
  signature: string;
  minutes: number;
  steps: TransitStep[];
  fare?: { amount: number; currency: string };
}

/** What a provider adapter or the mock emits before finalizeOptions. */
export type RawTransitOption = Omit<TransitOption, 'signature'>;

export interface TransitBasis {
  from: LatLng;
  to: LatLng;
  /** Server-echoed ISO instant with the departure stop's local offset, e.g. "2026-10-20T09:05:00+08:00". */
  departAt: string;
}

export interface TransitLookup {
  provider: TransitProviderId;
  fetchedAt: string;
  basis: TransitBasis;
  options: TransitOption[];
}

/** Persisted at day.transitByLeg[routeLegKey(from, to)]. */
export interface SavedLegTransit extends TransitLookup {
  /** A signature from `options`. Validated on read, never trusted. */
  chosen?: string;
}

export interface LegRef { dayId: string; fromPlaceId: string; toPlaceId: string }

export type StaleReason = 'fromMoved' | 'toMoved' | 'departureShifted';

export type LegTransit =
  | { status: 'ineligible' }
  | { status: 'empty' }
  | { status: 'saved'; saved: SavedLegTransit; chosen: TransitOption | null; stale: readonly StaleReason[] };

export const DEPARTURE_STALE_MINUTES = 30;
export const MOVED_STALE_METERS = 25;
export const TODAY_REFRESH_SUGGEST_DAYS = 7;

/** Where each provider's data sources are credited. The visible label is the UI's job. */
export const TRANSIT_ATTRIBUTION_URL: Record<TransitProviderId, string | null> = {
  transitous: 'https://transitous.org/sources/',
  mock: null,
};

export function routeLegKey(fromPlaceId: string, toPlaceId: string) {
  return `${fromPlaceId}:${toPlaceId}`;
}

export function isTransitEligible(mode: TravelMode, inside: boolean, from: Place, to: Place): boolean {
  return mode === 'public' && !inside && !isPlaceholder(from) && !isPlaceholder(to);
}

function movedMeters(basis: LatLng, place: Place) {
  return distanceMeters({ latitude: basis.lat, longitude: basis.lng }, place);
}

/** Wall-clock minutes as written in the instant, which carries the departure stop's own offset. */
function minutesOfDay(instant: string): number | null {
  const match = /T(\d{2}):(\d{2})/.exec(instant);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function circularMinutes(left: number, right: number) {
  const difference = Math.abs(left - right) % 1440;
  return Math.min(difference, 1440 - difference);
}

/**
 * The leg's transit view. Only the time of day is compared for departures, so a far-future trip
 * queried on a nearby representative day is not stale.
 * @param leaveMinutes the from-stop's planned leave time when Times are on, else null.
 */
export function legTransit(
  saved: SavedLegTransit | undefined,
  eligible: boolean,
  from: Place,
  to: Place,
  leaveMinutes: number | null,
): LegTransit {
  if (!eligible) return { status: 'ineligible' };
  if (!saved) return { status: 'empty' };
  const chosen = saved.chosen === undefined ? null : saved.options.find((option) => option.signature === saved.chosen) ?? null;
  const stale: StaleReason[] = [];
  if (movedMeters(saved.basis.from, from) > MOVED_STALE_METERS) stale.push('fromMoved');
  if (movedMeters(saved.basis.to, to) > MOVED_STALE_METERS) stale.push('toMoved');
  const departMinutes = minutesOfDay(saved.basis.departAt);
  if (leaveMinutes !== null && departMinutes !== null && circularMinutes(leaveMinutes, departMinutes) > DEPARTURE_STALE_MINUTES) {
    stale.push('departureShifted');
  }
  return { status: 'saved', saved, chosen, stale };
}

function signatureOf(option: RawTransitOption) {
  return option.steps
    .filter((step) => step.kind !== 'walk')
    .map((step) => `${step.kind}:${step.line ?? '?'}`)
    .join('>') || 'walk';
}

/** Adds signatures, keeps the fastest option per signature, and sorts fastest first. */
export function finalizeOptions(raw: RawTransitOption[]): TransitOption[] {
  const fastest = new Map<string, TransitOption>();
  for (const option of raw) {
    const signature = signatureOf(option);
    const existing = fastest.get(signature);
    if (!existing || option.minutes < existing.minutes) fastest.set(signature, { signature, ...option });
  }
  return [...fastest.values()].sort((left, right) => left.minutes - right.minutes || left.signature.localeCompare(right.signature));
}

/** A new lookup over the saved record. The choice survives only while its route is still offered. */
export function mergeLookup(previous: SavedLegTransit | undefined, lookup: TransitLookup): SavedLegTransit {
  const record: SavedLegTransit = {
    provider: lookup.provider,
    fetchedAt: lookup.fetchedAt,
    basis: lookup.basis,
    options: lookup.options,
  };
  const chosen = previous?.chosen;
  if (chosen !== undefined && lookup.options.some((option) => option.signature === chosen)) record.chosen = chosen;
  return record;
}

/**
 * Drops routes whose from or to stop has left the day. Adjacency is not required, so a reorder
 * followed by its undo keeps the route. Returns `day` itself when nothing is dropped.
 */
export function pruneTransitByLeg(day: TripDay): TripDay {
  const routes = day.transitByLeg;
  if (!routes) return day;
  const placeIds = new Set(day.placeIds);
  const keep = (key: string) => day.placeIds.some((fromId) => key.startsWith(`${fromId}:`) && placeIds.has(key.slice(fromId.length + 1)));
  const keys = Object.keys(routes);
  const kept = keys.filter(keep);
  if (kept.length === keys.length) return day;
  return { ...day, transitByLeg: Object.fromEntries(kept.map((key) => [key, routes[key]])) };
}

/**
 * Defaults transitByLeg to {} and prunes it. A missing record would make two collaborators who each
 * add a leg conflict on the whole field instead of merging per key. Returns `day` itself when unchanged.
 */
export function normalizeDayTransit(day: TripDay): TripDay {
  return pruneTransitByLeg(day.transitByLeg ? day : { ...day, transitByLeg: {} });
}
