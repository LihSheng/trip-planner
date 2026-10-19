import { describe, expect, it } from 'vitest';
import type { Place, TripDay } from '../types';
import {
  finalizeOptions,
  isTransitEligible,
  legTransit,
  mergeLookup,
  normalizeDayTransit,
  pruneTransitByLeg,
  type RawTransitOption,
  type SavedLegTransit,
  type TransitLookup,
  type TransitOption,
} from './transit';

const place = (id: string, latitude: number, longitude: number, extra: Partial<Place> = {}): Place => ({
  id, name: id, region: 'Taipei', category: 'Landmark', latitude, longitude, notes: '', ...extra,
});

const from = place('from', 25.0, 121.5);
const to = place('to', 25.05, 121.55);
const placeholder = place('meal', 25.0, 121.5, { placeholderKind: 'meal' });

const metro: TransitOption = { signature: 'metro:Red', minutes: 22, steps: [{ kind: 'metro', minutes: 22, line: 'Red' }] };
const bus: TransitOption = { signature: 'bus:307', minutes: 35, steps: [{ kind: 'bus', minutes: 35, line: '307' }] };

const saved = (extra: Partial<SavedLegTransit> = {}): SavedLegTransit => ({
  provider: 'transitous',
  fetchedAt: '2026-10-19T01:00:00.000Z',
  basis: { from: { lat: 25.0, lng: 121.5 }, to: { lat: 25.05, lng: 121.55 }, departAt: '2026-10-20T10:30:00+08:00' },
  options: [metro, bus],
  ...extra,
});

// One degree of latitude is about 111 km, so 0.0002 is about 22 m and 0.0003 about 33 m.
const north = (target: Place, degrees: number) => ({ ...target, latitude: target.latitude + degrees });

describe('isTransitEligible', () => {
  it('accepts public transport between two real stops anywhere', () => {
    expect(isTransitEligible('public', false, from, to)).toBe(true);
    expect(isTransitEligible('public', false, place('paris', 48.86, 2.35), place('lyon', 45.76, 4.84))).toBe(true);
  });

  it('rejects other modes, legs inside a venue and placeholders', () => {
    expect(isTransitEligible('walk', false, from, to)).toBe(false);
    expect(isTransitEligible('car', false, from, to)).toBe(false);
    expect(isTransitEligible('public', true, from, to)).toBe(false);
    expect(isTransitEligible('public', false, placeholder, to)).toBe(false);
    expect(isTransitEligible('public', false, from, placeholder)).toBe(false);
  });
});

describe('legTransit', () => {
  it('is ineligible regardless of what is saved, and empty when nothing is saved', () => {
    expect(legTransit(saved({ chosen: 'metro:Red' }), false, from, to, null)).toEqual({ status: 'ineligible' });
    expect(legTransit(undefined, true, from, to, null)).toEqual({ status: 'empty' });
  });

  it('resolves the chosen signature to its option', () => {
    const view = legTransit(saved({ chosen: 'bus:307' }), true, from, to, null);
    expect(view).toEqual({ status: 'saved', saved: saved({ chosen: 'bus:307' }), chosen: bus, stale: [] });
  });

  it('treats a chosen signature that is no longer offered as no choice', () => {
    const view = legTransit(saved({ chosen: 'tram:Gone' }), true, from, to, null);
    expect(view).toMatchObject({ status: 'saved', chosen: null, stale: [] });
  });

  it('marks a stop moved only beyond 25 m', () => {
    expect(legTransit(saved(), true, north(from, 0.0002), north(to, 0.0002), null)).toMatchObject({ stale: [] });
    expect(legTransit(saved(), true, north(from, 0.0003), to, null)).toMatchObject({ stale: ['fromMoved'] });
    expect(legTransit(saved(), true, from, north(to, 0.0003), null)).toMatchObject({ stale: ['toMoved'] });
  });

  it('marks the departure shifted only beyond 30 minutes of the time of day', () => {
    // Saved departure is 10:30 local.
    expect(legTransit(saved(), true, from, to, 11 * 60)).toMatchObject({ stale: [] });
    expect(legTransit(saved(), true, from, to, 10 * 60)).toMatchObject({ stale: [] });
    expect(legTransit(saved(), true, from, to, 11 * 60 + 1)).toMatchObject({ stale: ['departureShifted'] });
    expect(legTransit(saved(), true, from, to, 9 * 60 + 59)).toMatchObject({ stale: ['departureShifted'] });
  });

  it('never marks the departure shifted when Times are off', () => {
    expect(legTransit(saved(), true, from, to, null)).toMatchObject({ stale: [] });
  });

  it('compares departures across midnight the short way round', () => {
    const late = saved({ basis: { ...saved().basis, departAt: '2026-10-20T23:50:00+08:00' } });
    expect(legTransit(late, true, from, to, 10)).toMatchObject({ stale: [] });
  });
});

describe('finalizeOptions', () => {
  const ride = (kind: 'bus' | 'metro', line: string | undefined, minutes: number): RawTransitOption => ({
    minutes,
    steps: [{ kind: 'walk', minutes: 3 }, { kind, minutes: minutes - 3, line }],
  });

  it('signs options by their rides, ignoring walks', () => {
    const options = finalizeOptions([
      { minutes: 30, steps: [{ kind: 'metro', minutes: 10, line: 'Red' }, { kind: 'walk', minutes: 5 }, { kind: 'bus', minutes: 15, line: '307' }] },
      { minutes: 40, steps: [{ kind: 'walk', minutes: 40 }] },
      ride('bus', undefined, 50),
    ]);
    expect(options.map((option) => option.signature)).toEqual(['metro:Red>bus:307', 'walk', 'bus:?']);
  });

  it('keeps the fastest option per signature and sorts fastest first', () => {
    const options = finalizeOptions([ride('bus', '307', 40), ride('metro', 'Red', 25), ride('bus', '307', 32)]);
    expect(options.map((option) => [option.signature, option.minutes])).toEqual([['metro:Red', 25], ['bus:307', 32]]);
  });

  it('returns no options for an empty lookup', () => {
    expect(finalizeOptions([])).toEqual([]);
  });
});

describe('mergeLookup', () => {
  const lookup = (options: TransitOption[]): TransitLookup => ({
    provider: 'transitous',
    fetchedAt: '2026-10-21T02:00:00.000Z',
    basis: { from: { lat: 25.0, lng: 121.5 }, to: { lat: 25.05, lng: 121.55 }, departAt: '2026-10-21T10:30:00+08:00' },
    options,
  });

  it('keeps the choice when the same route is still offered, with its new minutes', () => {
    const fasterMetro = { ...metro, minutes: 19 };
    const merged = mergeLookup(saved({ chosen: 'metro:Red' }), lookup([fasterMetro, bus]));
    expect(merged).toEqual({ ...lookup([fasterMetro, bus]), chosen: 'metro:Red' });
    expect(legTransit(merged, true, from, to, null)).toMatchObject({ chosen: { minutes: 19 } });
  });

  it('drops the choice when the route is no longer offered', () => {
    const merged = mergeLookup(saved({ chosen: 'metro:Red' }), lookup([bus]));
    expect(merged).toEqual(lookup([bus]));
    expect('chosen' in merged).toBe(false);
  });

  it('saves a first lookup without a choice', () => {
    expect(mergeLookup(undefined, lookup([metro]))).toEqual(lookup([metro]));
  });

  it('is idempotent', () => {
    const once = mergeLookup(saved({ chosen: 'bus:307' }), lookup([metro, bus]));
    const twice = mergeLookup(once, lookup([metro, bus]));
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});

describe('pruneTransitByLeg', () => {
  const day = (placeIds: string[], transitByLeg?: TripDay['transitByLeg']): TripDay => ({ id: 'day-1', label: 'Day 1', placeIds, transitByLeg });

  it('returns the same day when every route still has both stops', () => {
    const unchanged = day(['a', 'b', 'c'], { 'a:b': saved(), 'c:a': saved() });
    expect(pruneTransitByLeg(unchanged)).toBe(unchanged);
    const withoutRoutes = day(['a']);
    expect(pruneTransitByLeg(withoutRoutes)).toBe(withoutRoutes);
  });

  it('drops routes whose stop left the day', () => {
    const pruned = pruneTransitByLeg(day(['a', 'c'], { 'a:b': saved(), 'b:c': saved(), 'a:c': saved() }));
    expect(Object.keys(pruned.transitByLeg!)).toEqual(['a:c']);
  });

  it('defaults a missing record on normalize and is otherwise the same day', () => {
    expect(normalizeDayTransit(day(['a'])).transitByLeg).toEqual({});
    const normalized = day(['a', 'b'], { 'a:b': saved() });
    expect(normalizeDayTransit(normalized)).toBe(normalized);
  });

  it('matches ids that themselves contain a colon', () => {
    const unchanged = day(['stay:1', 'b'], { 'stay:1:b': saved() });
    expect(pruneTransitByLeg(unchanged)).toBe(unchanged);
  });
});
