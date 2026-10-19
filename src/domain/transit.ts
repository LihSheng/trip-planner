import type { Place, TravelMode, TripDay, TripState } from '../types';
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

export type TransitSurface = 'planner' | 'today';

/** What the client asks for. The server resolves the origin's time zone and clamps past times to now. */
export type TransitDeparture = { kind: 'now' } | { kind: 'planned'; local: string };

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

export function latLngOf(place: Place): LatLng {
  return { lat: place.latitude, lng: place.longitude };
}

/** True while neither stop has moved further than MOVED_STALE_METERS from where the lookup was made. */
export function basisMatchesStops(basis: TransitBasis, from: Place, to: Place): boolean {
  return movedMeters(basis.from, from) <= MOVED_STALE_METERS && movedMeters(basis.to, to) <= MOVED_STALE_METERS;
}

/** The leg `ref` names, only while both stops are still adjacent in that order on that day. */
export function legAt(state: TripState, ref: LegRef): { day: TripDay; dayIndex: number; from: Place; to: Place } | null {
  const dayIndex = state.days.findIndex((day) => day.id === ref.dayId);
  const day = state.days[dayIndex];
  if (!day) return null;
  const fromIndex = day.placeIds.indexOf(ref.fromPlaceId);
  if (fromIndex < 0 || day.placeIds[fromIndex + 1] !== ref.toPlaceId) return null;
  const from = state.places.find((place) => place.id === ref.fromPlaceId);
  const to = state.places.find((place) => place.id === ref.toPlaceId);
  return from && to ? { day, dayIndex, from, to } : null;
}

function plannedLocal(dayDate: string, minutes: number) {
  // A leave time past midnight belongs to the next calendar day.
  const [year, month, date] = dayDate.split('-').map(Number);
  const day = new Date(Date.UTC(year, month - 1, date + Math.floor(minutes / 1440)));
  const minuteOfDay = minutes % 1440;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}T${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`;
}

/**
 * Decision 4: the from-stop's planned leave time on the trip day when the day has Times on,
 * otherwise now. Today mode always asks for now.
 * @param dayDate the trip day's 'yyyy-mm-dd'.
 * @param leaveMinutes the from-stop's planned start plus duration, or null without a start time.
 */
export function departureFor(input: { surface: TransitSurface; timesOn: boolean; dayDate: string; leaveMinutes: number | null }): TransitDeparture {
  if (input.surface === 'today' || !input.timesOn || input.leaveMinutes === null) return { kind: 'now' };
  return { kind: 'planned', local: plannedLocal(input.dayDate, input.leaveMinutes) };
}

/** Today mode nudges a refresh once a saved route is older than TODAY_REFRESH_SUGGEST_DAYS. */
export function isSavedRouteOld(saved: SavedLegTransit, now: Date): boolean {
  return now.getTime() - Date.parse(saved.fetchedAt) > TODAY_REFRESH_SUGGEST_DAYS * 24 * 60 * 60 * 1000;
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

/**
 * The leg's transit view as a surface shows it. Today always looks up "now", so a planned
 * departure says nothing there: its freshness is the age rule alone (decision 11).
 */
export function transitOnSurface(view: LegTransit, surface: TransitSurface): LegTransit {
  if (surface !== 'today' || view.status !== 'saved' || !view.stale.includes('departureShifted')) return view;
  return { ...view, stale: view.stale.filter((reason) => reason !== 'departureShifted') };
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
