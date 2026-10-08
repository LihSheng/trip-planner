import { describe, expect, it } from 'vitest';
import { projectDay } from './dayProjection';
import { toTime } from './schedule';
import type { LocationCluster, Place, TripDay } from '../types';

const first: Place = { id: 'first', name: 'First', region: 'Taipei', category: 'Landmark', latitude: 25.03, longitude: 121.56, notes: '' };
const second: Place = { id: 'second', name: 'Second', region: 'Taipei', category: 'Food', latitude: 25.04, longitude: 121.57, notes: '' };
const third: Place = { id: 'third', name: 'Third', region: 'Taipei', category: 'Nature', latitude: 25.1, longitude: 121.6, notes: '' };
const lunch: Place = { id: 'lunch', name: 'meal', region: '', category: 'Food', latitude: 0, longitude: 0, notes: '', placeholderKind: 'meal' };

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
    expect(times(projectDay(d, [first, second, third], []))).toEqual([
      'first 09:00-10:30 estimated',
      'second 13:00-14:00 planned',
      'third 15:52-17:52 estimated',
    ]);
  });

  it('chains estimated stops by duration plus resolved leg minutes', () => {
    const d = day({ placeIds: ['first', 'second', 'third'], stopSchedules: { first: { durationMinutes: 45 } } });
    const projection = projectDay(d, [first, second, third], []);
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

  it('uses the cluster connection minutes and walk inside a cluster', () => {
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

  it('estimates the leg after a placeholder from the last real place, and adds nothing into one', () => {
    const projection = projectDay(day({ placeIds: ['first', 'lunch', 'second'] }), [first, lunch, second], []);
    expect(projection.legs.map((leg) => leg.minutes)).toEqual([undefined, 23]);
    expect(times(projection)).toEqual([
      'first 09:00-10:30 estimated',
      'lunch 10:30-11:30 estimated',
      'second 11:53-12:53 estimated',
    ]);
  });

  it('adds nothing after a placeholder that has no real place before it', () => {
    const projection = projectDay(day({ placeIds: ['lunch', 'first'] }), [lunch, first], []);
    expect(projection.legs.map((leg) => leg.minutes)).toEqual([undefined]);
  });

  it('warns with the exact shortfall when a planned stop leaves too little travel time', () => {
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
});
