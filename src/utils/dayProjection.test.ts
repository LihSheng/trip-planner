import { describe, expect, it } from 'vitest';
import { nextAnchor, projectDay, storeProjectedStarts, timingLabel } from './dayProjection';
import { dayTravelMinutes, resolveLeg, sumLegMinutes } from './routing';
import { toTime } from './schedule';
import type { SavedLegTransit } from '../domain/transit';
import type { LocationCluster, Place, TripDay } from '../types';

const first: Place = { id: 'first', name: 'First', region: 'Taipei', category: 'Landmark', latitude: 25.03, longitude: 121.56, notes: '' };
const second: Place = { id: 'second', name: 'Second', region: 'Taipei', category: 'Food', latitude: 25.04, longitude: 121.57, notes: '' };
const third: Place = { id: 'third', name: 'Third', region: 'Taipei', category: 'Nature', latitude: 25.1, longitude: 121.6, notes: '' };
const lunch: Place = { id: 'lunch', name: 'meal', region: '', category: 'Food', latitude: 0, longitude: 0, notes: '', placeholderKind: 'meal' };
const all = [first, second, third, lunch];

const day = (overrides: Partial<TripDay> = {}): TripDay => ({ id: 'day-1', label: '', placeIds: ['first', 'second'], travelMode: 'walk', ...overrides });

function times(projection: ReturnType<typeof projectDay>) {
  return projection.stops.map(({ place, timing }) => `${place.id} ${toTime(timing.start)}-${toTime(timing.end)} ${timing.source}`);
}

describe('projectDay', () => {
  it('starts the first stop at 09:00 when the day has no start time', () => {
    expect(times(projectDay(day(), [first, second], []))).toEqual([
      'first 09:00-10:30 estimated',
      'second 10:53-11:53 estimated',
    ]);
  });

  it('respects the day start time', () => {
    expect(times(projectDay(day({ startTime: '08:15' }), [first, second], []))).toEqual([
      'first 08:15-09:45 estimated',
      'second 10:08-11:08 estimated',
    ]);
  });

  it('orders stops by the day, whatever order the places arrive in', () => {
    expect(projectDay(day(), [second, third, first], []).stops.map(({ place }) => place.id)).toEqual(['first', 'second']);
  });

  it('resets the chain at a planned anchor', () => {
    const d = day({ placeIds: ['first', 'second', 'third'], stopSchedules: { second: { startTime: '13:00' } } });
    expect(times(projectDay(d, all, []))).toEqual([
      'first 09:00-10:30 estimated',
      'second 13:00-14:00 planned',
      'third 15:52-17:52 estimated',
    ]);
  });

  it('chains estimated stops by duration plus resolved leg minutes', () => {
    const d = day({ placeIds: ['first', 'second', 'third'], stopSchedules: { first: { durationMinutes: 45 } } });
    const projection = projectDay(d, all, []);
    expect(times(projection)).toEqual([
      'first 09:00-09:45 estimated',
      'second 10:08-11:08 estimated',
      'third 13:00-15:00 estimated',
    ]);
    expect(projection.legs.map((leg) => [leg.from.id, leg.to.id, leg.mode, leg.minutes])).toEqual([
      ['first', 'second', 'walk', 23],
      ['second', 'third', 'walk', 112],
    ]);
  });

  it('uses the cluster connection minutes and walks inside a cluster', () => {
    const clusters: LocationCluster[] = [{ id: 'c1', name: 'Mall', anchorPlaceId: 'first', members: [{ placeId: 'second', relationship: 'inside', travelMinutes: 4 }] }];
    const projection = projectDay(day({ travelMode: 'car' }), [first, second], clusters);
    expect(projection.legs[0]).toMatchObject({ mode: 'walk', minutes: 4, inside: true });
    expect(times(projection)).toEqual(['first 09:00-10:30 estimated', 'second 10:34-11:34 estimated']);
  });

  it('honours a leg mode override', () => {
    const projection = projectDay(day({ legModeOverrides: { 'first:second': 'car' } }), [first, second], []);
    expect(projection.legs[0]).toMatchObject({ mode: 'car', minutes: 5 });
    expect(times(projection)[1]).toBe('second 10:35-11:35 estimated');
  });

  describe('with a placeholder between two real stops', () => {
    const bridged = day({ placeIds: ['first', 'lunch', 'second'] });

    it('estimates the leg after it from the last real stop, and adds nothing into it', () => {
      const projection = projectDay(bridged, all, []);
      expect(projection.legs.map((leg) => [leg.from.id, leg.to.id, leg.minutes])).toEqual([
        ['first', 'lunch', undefined],
        ['first', 'second', 23],
      ]);
      expect(times(projection)).toEqual([
        'first 09:00-10:30 estimated',
        'lunch 10:30-11:30 estimated',
        'second 11:53-12:53 estimated',
      ]);
    });

    it('agrees with the planner total and the map day total', () => {
      const projection = projectDay(bridged, all, []);
      expect(sumLegMinutes(projection.legs)).toBe(23);
      expect(dayTravelMinutes(bridged, new Map(all.map((place) => [place.id, place])), [])).toBe(23);
    });
  });

  it('adds nothing after a placeholder that has no real stop before it', () => {
    const projection = projectDay(day({ placeIds: ['lunch', 'first'] }), all, []);
    expect(projection.legs.map((leg) => leg.minutes)).toEqual([undefined]);
    expect(times(projection)).toEqual(['lunch 09:00-10:00 estimated', 'first 10:00-11:30 estimated']);
  });

  describe('with a chosen transit route', () => {
    const route = (chosen?: string): SavedLegTransit => ({
      provider: 'mock',
      fetchedAt: '2026-10-19T01:00:00.000Z',
      basis: { from: { lat: first.latitude, lng: first.longitude }, to: { lat: second.latitude, lng: second.longitude }, departAt: '2026-10-20T10:30:00+08:00' },
      options: [{ signature: 'metro:Red', minutes: 31, steps: [{ kind: 'metro', minutes: 31, line: 'Red' }] }],
      ...(chosen ? { chosen } : {}),
    });
    const transitDay = (chosen?: string, placeIds = ['first', 'second', 'third']) => day({
      placeIds, travelMode: 'public', transitByLeg: { 'first:second': route(chosen) },
    });

    it('moves every later estimated stop by the route minutes', () => {
      expect(times(projectDay(transitDay(), all, []))).toEqual([
        'first 09:00-10:30 estimated',
        'second 10:35-11:35 estimated',
        'third 11:59-13:59 estimated',
      ]);
      const chosen = projectDay(transitDay('metro:Red'), all, []);
      expect(chosen.legs[0]).toMatchObject({ minutes: 31, minutesSource: 'transit' });
      expect(times(chosen)).toEqual([
        'first 09:00-10:30 estimated',
        'second 11:01-12:01 estimated',
        'third 12:25-14:25 estimated',
      ]);
    });

    it('drives the bridged leg when the route is saved for the real pair around a placeholder', () => {
      const projection = projectDay(transitDay('metro:Red', ['first', 'lunch', 'second']), all, []);
      expect(projection.legs[1]).toMatchObject({ minutes: 31, minutesSource: 'transit', follows: lunch });
      expect(times(projection)[2]).toBe('second 12:01-13:01 estimated');
    });
  });

  describe('warnings', () => {
    it('gives the exact shortfall when a planned stop leaves too little travel time', () => {
      const d = day({ stopSchedules: { first: { startTime: '09:00' }, second: { startTime: '10:40' } } });
      const projection = projectDay(d, [first, second], []);
      expect(times(projection)).toEqual(['first 09:00-10:30 planned', 'second 10:40-11:40 planned']);
      expect(projection.stops.map((stop) => stop.warnings)).toEqual([[], [{ kind: 'shortTravel', shortByMinutes: 13 }]]);
    });

    it('warns when an estimated stop falls outside opening hours', () => {
      const opensLate = { ...second, openingHours: { opensAt: '11:00', closesAt: '20:00' } };
      const projection = projectDay(day(), [first, opensLate], []);
      expect(projection.stops[1].timing.source).toBe('estimated');
      expect(projection.stops[1].warnings).toEqual([{ kind: 'outsideHours' }]);
    });

    it('reports both kinds on one stop', () => {
      const d = day({ stopSchedules: { first: { startTime: '09:00', durationMinutes: 90 }, second: { startTime: '09:40', durationMinutes: 60 } } });
      const opensAtTen = { ...second, openingHours: { opensAt: '10:00', closesAt: '18:00' } };
      expect(projectDay(d, [first, opensAtTen], []).stops[1].warnings).toEqual([
        { kind: 'outsideHours' },
        { kind: 'shortTravel', shortByMinutes: 73 },
      ]);
    });

    it('uses the leg mode override and cluster minutes for the shortfall', () => {
      const timed = (secondStart: string, overrides: Partial<TripDay> = {}) => day({
        stopSchedules: { first: { startTime: '09:00', durationMinutes: 60 }, second: { startTime: secondStart, durationMinutes: 60 } },
        ...overrides,
      });
      const insideMall: LocationCluster[] = [{ id: 'c1', name: 'Mall', anchorPlaceId: 'first', members: [{ placeId: 'second', relationship: 'inside', travelMinutes: 4 }] }];
      const car = { legModeOverrides: { 'first:second': 'car' as const } };
      expect(projectDay(timed('10:05', car), [first, second], []).stops[1].warnings).toEqual([]);
      expect(projectDay(timed('10:04', car), [first, second], []).stops[1].warnings).toEqual([{ kind: 'shortTravel', shortByMinutes: 1 }]);
      expect(projectDay(timed('10:04'), [first, second], insideMall).stops[1].warnings).toEqual([]);
      expect(projectDay(timed('10:03'), [first, second], insideMall).stops[1].warnings).toEqual([{ kind: 'shortTravel', shortByMinutes: 1 }]);
    });

    it('counts an estimated stop between two planned ones, duration included', () => {
      const insideMall: LocationCluster[] = [{
        id: 'c1', name: 'Mall', anchorPlaceId: 'first',
        members: [{ placeId: 'second', relationship: 'inside', travelMinutes: 4 }, { placeId: 'third', relationship: 'inside', travelMinutes: 6 }],
      }];
      const d = (thirdStart: string) => day({
        placeIds: ['first', 'second', 'third'], travelMode: 'car',
        stopSchedules: { first: { startTime: '09:00', durationMinutes: 60 }, third: { startTime: thirdStart } },
      });
      // 09:00 + 60, 4 min to Second, 60 at Second, 6 min to Third.
      expect(projectDay(d('11:10'), all, insideMall).stops[2].warnings).toEqual([]);
      expect(projectDay(d('11:09'), all, insideMall).stops[2].warnings).toEqual([{ kind: 'shortTravel', shortByMinutes: 1 }]);
    });

    it('has none for a day without opening hours or planned times', () => {
      expect(projectDay(day(), [first, second], []).stops.flatMap((stop) => stop.warnings)).toEqual([]);
    });
  });
});

describe('storeProjectedStarts', () => {
  const fourth: Place = { id: 'fourth', name: 'Fourth', region: 'Taipei', category: 'Food', latitude: 25.06, longitude: 121.59, notes: '' };
  const foodThird: Place = { ...third, category: 'Food', latitude: 25.05, longitude: 121.58 };
  const places = [first, second, foodThird, fourth, lunch];
  const mall: LocationCluster[] = [{
    id: 'c1', name: 'Mall', anchorPlaceId: 'first',
    members: [{ placeId: 'second', relationship: 'inside', travelMinutes: 4 }, { placeId: 'third', relationship: 'inside', travelMinutes: 6 }],
  }];

  it('stores the projected starts of estimated stops and stops at the next planned one', () => {
    const d: TripDay = {
      id: 'day-1', label: '', placeIds: ['first', 'second', 'third', 'fourth'], travelMode: 'car',
      stopSchedules: {
        first: { startTime: '09:00', durationMinutes: 60 },
        second: { durationMinutes: 30 },
        third: { startTime: '13:00', durationMinutes: 45 },
      },
    };
    expect(storeProjectedStarts(d, places, mall, 'first').stopSchedules).toEqual({
      first: { startTime: '09:00', durationMinutes: 60 },
      second: { startTime: '10:04', durationMinutes: 30 },
      third: { startTime: '13:00', durationMinutes: 45 },
    });
  });

  it('uses the leg mode override for the travel time', () => {
    const d = day({ legModeOverrides: { 'first:second': 'car' }, stopSchedules: { first: { startTime: '09:00', durationMinutes: 60 } } });
    expect(storeProjectedStarts(d, places, [], 'first').stopSchedules?.second).toEqual({ startTime: '10:05', durationMinutes: 60 });
  });

  it('stores the bridged time after a placeholder, as the timeline shows it', () => {
    const d = day({ placeIds: ['first', 'lunch', 'second'], stopSchedules: { first: { startTime: '09:00', durationMinutes: 60 } } });
    const stored = storeProjectedStarts(d, places, [], 'first');
    expect(stored.stopSchedules).toEqual({
      first: { startTime: '09:00', durationMinutes: 60 },
      lunch: { startTime: '10:00', durationMinutes: 60 },
      second: { startTime: '11:23', durationMinutes: 60 },
    });
    expect(times(projectDay(stored, places, []))).toEqual([
      'first 09:00-10:00 planned',
      'lunch 10:00-11:00 planned',
      'second 11:23-12:23 planned',
    ]);
  });

  it('leaves the day alone when the stop has no start time', () => {
    const d = day({ stopSchedules: { first: { durationMinutes: 60 } } });
    expect(storeProjectedStarts(d, places, [], 'first')).toBe(d);
  });
});

describe('nextAnchor', () => {
  const anchor = (d: TripDay, current: string | null, next: string | null, places = all, clusters: LocationCluster[] = []) =>
    nextAnchor(d, projectDay(d, places, clusters), clusters, current, next);

  it('leaves at the planned start minus the planner leg minutes', () => {
    const d = day({ stopSchedules: { second: { startTime: '15:30' } } });
    expect(anchor(d, 'first', 'second')).toEqual({
      kind: 'leaveBy', leaveAt: '15:07', arriveBy: '15:30', estimated: false, travelMinutes: 23, mode: 'walk', toPlaceId: 'second',
      leg: projectDay(d, all, []).legs[0],
      legRef: { dayId: 'day-1', fromPlaceId: 'first', toPlaceId: 'second' },
    });
  });

  it('gives a leave-by line on a day without planned times, at the times the planner shows', () => {
    const d = day();
    const { stops } = projectDay(d, all, []);
    expect(stops.map(({ timing }) => timingLabel(timing))).toEqual(['~09:00–10:30', '~10:53–11:53']);
    // Leave when the current stop's projected visit ends, arrive at the next stop's projected start.
    expect(anchor(d, 'first', 'second')).toMatchObject({ kind: 'leaveBy', leaveAt: '10:30', arriveBy: '10:53', estimated: true, travelMinutes: 23 });
  });

  it('follows a chosen leg mode and a location cluster, as the planner does', () => {
    expect(anchor(day({ stopSchedules: { second: { startTime: '15:30' } }, legModeOverrides: { 'first:second': 'car' } }), 'first', 'second'))
      .toMatchObject({ leaveAt: '15:25', travelMinutes: 5, mode: 'car' });
    const insideMall: LocationCluster[] = [{ id: 'c1', name: 'Mall', anchorPlaceId: 'first', members: [{ placeId: 'second', relationship: 'inside', travelMinutes: 4 }] }];
    expect(anchor(day({ travelMode: 'car', stopSchedules: { second: { startTime: '15:30' } } }), 'first', 'second', all, insideMall))
      .toMatchObject({ leaveAt: '15:26', travelMinutes: 4, mode: 'walk' });
  });

  describe('over a placeholder', () => {
    const d = day({ placeIds: ['first', 'lunch', 'second'], stopSchedules: { second: { startTime: '15:30' } } });
    const bridged = projectDay(d, all, []).legs[1];
    const bridgedRef = { dayId: 'day-1', fromPlaceId: 'first', toPlaceId: 'second' };

    it('uses the bridged leg when the placeholder was skipped, so transit opens for it', () => {
      expect(bridged).toMatchObject({ from: first, to: second, follows: lunch, minutes: 23 });
      expect(anchor(d, 'first', 'second')).toMatchObject({ leaveAt: '15:07', travelMinutes: 23, leg: bridged, legRef: bridgedRef });
    });

    it('uses the bridged leg from the placeholder too, since the traveller is still where the last real stop was', () => {
      expect(anchor(d, 'lunch', 'second')).toMatchObject({ leaveAt: '15:07', travelMinutes: 23, leg: bridged, legRef: bridgedRef });
    });

    it('has no travel into the placeholder', () => {
      expect(anchor(d, 'first', 'lunch')).toMatchObject({ kind: 'leaveBy', travelMinutes: 0, arriveBy: '10:30', estimated: true });
    });

    it('has no travel after a leading placeholder', () => {
      const leading = day({ placeIds: ['lunch', 'second'], stopSchedules: { second: { startTime: '13:00' } } });
      expect(anchor(leading, 'lunch', 'second')).toMatchObject({ kind: 'leaveBy', travelMinutes: 0, leaveAt: '13:00' });
    });
  });

  it('times the direct trip without a saved route when a real stop between was skipped', () => {
    const d = day({ placeIds: ['first', 'third', 'second'], stopSchedules: { second: { startTime: '15:30' } } });
    expect(anchor(d, 'first', 'second')).toMatchObject({
      leaveAt: '15:07', travelMinutes: 23, legRef: null, leg: resolveLeg(d, [], first, second),
    });
  });

  describe('without a current stop', () => {
    it('says when to be at a planned next stop', () => {
      expect(anchor(day({ stopSchedules: { second: { startTime: '10:00' } } }), null, 'second')).toEqual({
        kind: 'leaveBy', leaveAt: '10:00', arriveBy: '10:00', estimated: false, travelMinutes: 0, mode: 'walk', toPlaceId: 'second', leg: null, legRef: null,
      });
    });

    it('gives the opening time instead of an estimate', () => {
      const opening = { ...second, openingHours: { opensAt: '09:30', closesAt: '18:00' } };
      expect(anchor(day(), null, 'second', [first, opening])).toEqual({ kind: 'opensAt', opensAt: '09:30', placeId: 'second' });
      expect(anchor(day(), null, 'second')).toEqual({ kind: 'none' });
    });
  });

  it('returns none without a next stop', () => {
    expect(anchor(day(), 'first', null)).toEqual({ kind: 'none' });
    expect(anchor(day(), 'first', 'missing')).toEqual({ kind: 'none' });
  });

  it('clamps leaveAt at midnight', () => {
    expect(anchor(day({ stopSchedules: { second: { startTime: '00:10' } } }), 'first', 'second')).toMatchObject({ leaveAt: '00:00', arriveBy: '00:10' });
  });
});
