import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import type { LocationCluster, Place, TripDay } from '../types';
import { dayLegs, dayStops, dayTravelMinutes, effectiveLegMode, isDrawableLeg, markRouteStale, resolveLeg, routeLegKey } from './routing';

const day: TripDay = { id: 'day-1', label: 'Day 1', placeIds: ['a', 'b'], travelMode: 'public' };

describe('routing helpers', () => {
  it('uses a per-leg override only when one is selected', () => {
    expect(effectiveLegMode(day, 'a', 'b')).toBe('public');
    expect(effectiveLegMode({ ...day, legModeOverrides: { [routeLegKey('a', 'b')]: 'walk' } }, 'a', 'b')).toBe('walk');
  });

  it('marks saved routes stale without dropping their result', () => {
    const stale = markRouteStale({ ...day, routeUpdatedAt: '2026-01-01T00:00:00.000Z', routeLegs: [] });
    expect(stale.routeStale).toBe(true);
    expect(stale.routeUpdatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

const place = (id: string, latitude: number, longitude: number, extra: Partial<Place> = {}): Place => ({
  id, name: id, region: 'Taipei', category: 'Landmark', latitude, longitude, notes: '', ...extra,
});

describe('resolveLeg', () => {
  const a = place('a', 25.0, 121.5);
  const b = place('b', 25.0, 121.6);
  const cluster = (relationship: 'inside' | 'walkable' | 'same-area', extra = {}): LocationCluster => ({
    id: 'c1', name: 'Cluster', anchorPlaceId: 'a',
    members: [{ placeId: 'a', relationship: 'inside' }, { placeId: 'b', relationship, ...extra }],
  });

  it('uses the day default mode and an estimated duration', () => {
    const leg = resolveLeg({ ...day, travelMode: 'car' }, [], a, b);
    expect(leg.mode).toBe('car');
    expect(leg.legMode).toBe('default');
    expect(leg.inside).toBe(false);
    expect(leg.relationship).toBeUndefined();
    expect(leg.minutes).toBeGreaterThan(0);
  });

  it('prefers an explicit override', () => {
    const leg = resolveLeg({ ...day, legModeOverrides: { 'a:b': 'bike' } }, [], a, b);
    expect(leg.legMode).toBe('bike');
    expect(leg.mode).toBe('bike');
  });

  it('walks inside a cluster using the member minutes', () => {
    const leg = resolveLeg({ ...day, legModeOverrides: { 'a:b': 'car' } }, [cluster('inside', { travelMinutes: 4 })], a, b);
    expect(leg.inside).toBe(true);
    expect(leg.relationship).toBe('inside');
    expect(leg.mode).toBe('walk');
    expect(leg.minutes).toBe(4);
  });

  it('walks for walkable cluster members', () => {
    const leg = resolveLeg(day, [cluster('walkable', { walkMinutes: 7 })], a, b);
    expect(leg.relationship).toBe('walkable');
    expect(leg.mode).toBe('walk');
    expect(leg.minutes).toBe(7);
  });

  it('leaves minutes undefined when a stop is a placeholder', () => {
    const leg = resolveLeg(day, [], a, place('b', 25.0, 121.6, { placeholderKind: 'free-time' as Place['placeholderKind'] }));
    expect(leg.minutes).toBeUndefined();
    expect(leg.mode).toBe('public');
  });
});

describe('dayTravelMinutes', () => {
  // Seed day 2 with a hotel-stay copy first and a meal placeholder between Shifen and Jiufen.
  // The map used to drop both (they are not markers) and route Shifen straight to Jiufen.
  const state = createInitialState();
  const hotel = place('hotel', 25.0478, 121.517, { category: 'Accommodation' });
  const stay = { ...hotel, id: 'stay-1', assignmentOf: 'hotel' };
  const lunch = place('placeholder-lunch', 0, 0, { region: '', placeholderKind: 'meal' });
  const placesById = new Map([...state.places, hotel, stay, lunch].map((item) => [item.id, item]));
  const dayTwo: TripDay = { ...state.days[1], placeIds: ['stay-1', 'shifen', 'placeholder-lunch', 'jiufen'] };

  it('sums the legs the planner shows, counting the hotel stop and leaving placeholder legs at 0', () => {
    const legs = dayLegs(dayTwo, placesById, []);
    expect(legs.map((leg) => leg.minutes)).toEqual([85, undefined, undefined]);
    expect(dayTravelMinutes(dayTwo, placesById, [])).toBe(85);
  });

  it('does not bridge over a placeholder', () => {
    const placeholderDay: TripDay = { ...dayTwo, placeIds: ['shifen', 'placeholder-lunch', 'jiufen'] };
    expect(dayTravelMinutes(placeholderDay, placesById, [])).toBe(0);
    expect(dayTravelMinutes({ ...dayTwo, placeIds: ['shifen', 'jiufen'] }, placesById, [])).toBe(33);
  });

  it('draws only legs with real coordinates at both ends: the hotel stay leg, not the placeholder ones', () => {
    const legs = dayLegs(dayTwo, placesById, []);
    expect(legs.map((leg) => [leg.from.id, leg.to.id, isDrawableLeg(leg)])).toEqual([
      ['stay-1', 'shifen', true],
      ['shifen', 'placeholder-lunch', false],
      ['placeholder-lunch', 'jiufen', false],
    ]);
  });

  it('pairs legs with stops, skipping ids with no place', () => {
    const withMissing: TripDay = { ...dayTwo, placeIds: ['stay-1', 'gone', 'shifen', 'placeholder-lunch', 'jiufen'] };
    const stops = dayStops(withMissing, placesById);
    const legs = dayLegs(withMissing, placesById, []);
    expect(stops.map((stop) => stop.id)).toEqual(['stay-1', 'shifen', 'placeholder-lunch', 'jiufen']);
    expect(legs).toHaveLength(stops.length - 1);
    legs.forEach((leg, i) => expect([leg.from, leg.to]).toEqual([stops[i], stops[i + 1]]));
  });
});
