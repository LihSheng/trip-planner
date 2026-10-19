import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import type { LocationCluster, Place, TripDay } from '../types';
import type { SavedLegTransit, TransitOption } from '../domain/transit';
import { dayLegs, dayStops, dayTravelMinutes, isDrawableLeg, resolveLeg, viewportPlaces } from './routing';

const day: TripDay = { id: 'day-1', label: 'Day 1', placeIds: ['a', 'b'], travelMode: 'public' };

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
    expect(leg.minutesSource).toBe('none');
    expect(leg.mode).toBe('public');
    expect(leg.transit).toEqual({ status: 'ineligible' });
  });

  describe('with a saved transit route', () => {
    const metro: TransitOption = { signature: 'metro:Red', minutes: 14, steps: [{ kind: 'metro', minutes: 14, line: 'Red' }] };
    const saved = (chosen?: string, departAt = '2026-10-20T10:30:00+08:00'): SavedLegTransit => ({
      provider: 'transitous',
      fetchedAt: '2026-10-19T01:00:00.000Z',
      basis: { from: { lat: 25.0, lng: 121.5 }, to: { lat: 25.0, lng: 121.6 }, departAt },
      options: [metro],
      ...(chosen ? { chosen } : {}),
    });
    const withRoute = (route: SavedLegTransit, extra: Partial<TripDay> = {}): TripDay => ({ ...day, transitByLeg: { 'a:b': route }, ...extra });

    it('uses the chosen route minutes on a public leg', () => {
      const leg = resolveLeg(withRoute(saved('metro:Red')), [], a, b);
      expect(leg.key).toBe('a:b');
      expect(leg.minutes).toBe(14);
      expect(leg.minutesSource).toBe('transit');
      expect(leg.transit).toMatchObject({ status: 'saved', chosen: metro, stale: [] });
    });

    it('beats same-area cluster minutes', () => {
      const leg = resolveLeg(withRoute(saved('metro:Red')), [cluster('same-area', { travelMinutes: 30, travelMode: 'public' })], a, b);
      expect(leg.minutes).toBe(14);
      expect(leg.minutesSource).toBe('transit');
    });

    it('keeps driving minutes when stale', () => {
      const shifted = withRoute(saved('metro:Red', '2026-10-20T15:00:00+08:00'), {
        timeManagementEnabled: true,
        stopSchedules: { a: { startTime: '09:00', durationMinutes: 60 } },
      });
      const leg = resolveLeg(shifted, [], a, b);
      expect(leg.minutes).toBe(14);
      expect(leg.transit).toMatchObject({ status: 'saved', stale: ['departureShifted'] });
    });

    it('falls back to the estimate without a valid choice', () => {
      const estimate = resolveLeg(day, [], a, b).minutes;
      expect(resolveLeg(withRoute(saved()), [], a, b)).toMatchObject({ minutes: estimate, minutesSource: 'estimate' });
      expect(resolveLeg(withRoute(saved('bus:Gone')), [], a, b)).toMatchObject({ minutes: estimate, minutesSource: 'estimate' });
    });

    it('ignores the route while the leg is overridden to another mode', () => {
      const leg = resolveLeg(withRoute(saved('metro:Red'), { legModeOverrides: { 'a:b': 'taxi' } }), [], a, b);
      expect(leg.transit).toEqual({ status: 'ineligible' });
      expect(leg.minutesSource).toBe('estimate');
    });

    it('ignores the route inside a venue', () => {
      const leg = resolveLeg(withRoute(saved('metro:Red')), [cluster('inside', { travelMinutes: 4 })], a, b);
      expect(leg.minutes).toBe(4);
      expect(leg.minutesSource).toBe('cluster');
    });
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

  it('sums the legs the planner shows, counting the hotel stop and bridging the placeholder', () => {
    const legs = dayLegs(dayTwo, placesById, []);
    expect(legs.map((leg) => leg.minutes)).toEqual([85, undefined, 33]);
    expect(dayTravelMinutes(dayTwo, placesById, [])).toBe(118);
  });

  it('bridges a placeholder: the leg after it runs from the last real stop, the leg into it adds 0', () => {
    const placeholderDay: TripDay = { ...dayTwo, placeIds: ['shifen', 'placeholder-lunch', 'jiufen'] };
    const legs = dayLegs(placeholderDay, placesById, []);
    expect(legs.map((leg) => [leg.from.id, leg.to.id, leg.follows?.id, leg.minutes])).toEqual([
      ['shifen', 'placeholder-lunch', undefined, undefined],
      ['shifen', 'jiufen', 'placeholder-lunch', 33],
    ]);
    expect(dayTravelMinutes(placeholderDay, placesById, [])).toBe(33);
    expect(dayTravelMinutes({ ...dayTwo, placeIds: ['shifen', 'jiufen'] }, placesById, [])).toBe(33);
  });

  it('bridges several placeholders in a row and adds nothing after a leading placeholder', () => {
    const coffee = place('placeholder-coffee', 0, 0, { region: '', placeholderKind: 'coffee' });
    const withCoffee = new Map([...placesById, [coffee.id, coffee]]);
    const twoBreaks: TripDay = { ...dayTwo, placeIds: ['shifen', 'placeholder-lunch', 'placeholder-coffee', 'jiufen'] };
    expect(dayLegs(twoBreaks, withCoffee, []).map((leg) => [leg.from.id, leg.minutes])).toEqual([
      ['shifen', undefined], ['placeholder-lunch', undefined], ['shifen', 33],
    ]);
    expect(dayTravelMinutes({ ...dayTwo, placeIds: ['placeholder-lunch', 'jiufen'] }, placesById, [])).toBe(0);
  });

  it('times a bridged leg from the end of the placeholder, not from the last real stop', () => {
    const timed: TripDay = {
      ...dayTwo,
      placeIds: ['shifen', 'placeholder-lunch', 'jiufen'],
      timeManagementEnabled: true,
      stopSchedules: { shifen: { startTime: '09:00', durationMinutes: 90 }, 'placeholder-lunch': { startTime: '11:30', durationMinutes: 60 } },
      transitByLeg: {
        'shifen:jiufen': {
          provider: 'mock', fetchedAt: '2026-10-19T00:00:00.000Z',
          basis: { from: { lat: placesById.get('shifen')!.latitude, lng: placesById.get('shifen')!.longitude }, to: { lat: placesById.get('jiufen')!.latitude, lng: placesById.get('jiufen')!.longitude }, departAt: '2026-11-08T12:30:00+08:00' },
          options: [],
        },
      },
    };
    // Lunch ends 12:30, the lookup's departure, so the route is current; Shifen's 10:30 would have been 120 minutes off.
    expect(dayLegs(timed, placesById, [])[1].transit).toMatchObject({ status: 'saved', stale: [] });
    const lateLunch = { ...timed, stopSchedules: { ...timed.stopSchedules, 'placeholder-lunch': { startTime: '13:30', durationMinutes: 60 } } };
    expect(dayLegs(lateLunch, placesById, [])[1].transit).toMatchObject({ status: 'saved', stale: ['departureShifted'] });
  });

  it('draws legs with real coordinates at both ends: the hotel stay leg and the bridged leg, not the one into the placeholder', () => {
    const legs = dayLegs(dayTwo, placesById, []);
    expect(legs.map((leg) => [leg.from.id, leg.to.id, isDrawableLeg(leg)])).toEqual([
      ['stay-1', 'shifen', true],
      ['shifen', 'placeholder-lunch', false],
      ['shifen', 'jiufen', true],
    ]);
  });

  it('fits the viewport to the hotel end of a drawn leg even though the stay has no marker', () => {
    const shifen = placesById.get('shifen')!;
    const jiufen = placesById.get('jiufen')!;
    const ids = (list: Place[]) => list.map((item) => item.id);
    const legsOf = (placeIds: string[]) => dayLegs({ ...dayTwo, placeIds }, placesById, []);
    // [stay, Shifen]: the only marker is Shifen, but the stay -> Shifen line is drawn.
    expect(ids(viewportPlaces([shifen], legsOf(['stay-1', 'shifen'])))).toEqual(['shifen', 'stay-1']);
    // Seed day 2: the stay is added, the meal placeholder (0,0) never is.
    expect(ids(viewportPlaces([shifen, jiufen], dayLegs(dayTwo, placesById, [])))).toEqual(['shifen', 'jiufen', 'stay-1']);
    // Stay -> lunch -> Jiufen draws the bridged stay -> Jiufen line, so the stay is pulled into view.
    expect(ids(viewportPlaces([jiufen], legsOf(['stay-1', 'placeholder-lunch', 'jiufen'])))).toEqual(['jiufen', 'stay-1']);
  });

  it('returns the marker list itself when no leg end is missing, so the map does not refit', () => {
    const markers = [placesById.get('shifen')!, placesById.get('jiufen')!];
    expect(viewportPlaces(markers, dayLegs({ ...dayTwo, placeIds: ['shifen', 'jiufen'] }, placesById, []))).toBe(markers);
    expect(viewportPlaces(markers, [])).toBe(markers);
  });

  it('pairs legs with stops, skipping ids with no place', () => {
    const withMissing: TripDay = { ...dayTwo, placeIds: ['stay-1', 'gone', 'shifen', 'placeholder-lunch', 'jiufen'] };
    const stops = dayStops(withMissing, placesById);
    const legs = dayLegs(withMissing, placesById, []);
    expect(stops.map((stop) => stop.id)).toEqual(['stay-1', 'shifen', 'placeholder-lunch', 'jiufen']);
    expect(legs).toHaveLength(stops.length - 1);
    legs.forEach((leg, i) => expect([leg.follows ?? leg.from, leg.to]).toEqual([stops[i], stops[i + 1]]));
  });
});
