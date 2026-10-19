import { describe, expect, it } from 'vitest';
import { cascadeStartTimes, dayWarningCount, dayWarnings, defaultDuration, nextAnchor, scheduleFor, toMinutes, toTime } from './schedule';
import type { LocationCluster, Place, TripDay } from '../types';
import { resolveLeg } from './routing';

const first: Place = { id: 'first', name: 'First', region: 'Taipei', category: 'Landmark', latitude: 25.03, longitude: 121.56, notes: '' };
const second: Place = { id: 'second', name: 'Second', region: 'Taipei', category: 'Food', latitude: 25.04, longitude: 121.57, notes: '' };

describe('schedule helpers', () => {
  it('formats 24-hour values', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toTime(570)).toBe('09:30');
    expect(toMinutes('9:30')).toBeNull();
    expect(toTime(-10)).toBe('00:00');
    expect(toTime(9999)).toBe('23:59');
  });

  it('uses transport modes for distance estimates', () => {
    const legDay = (mode: TripDay['travelMode']): TripDay => ({ id: 'day-1', label: '', placeIds: ['first', 'second'], travelMode: mode });
    expect(resolveLeg(legDay('walk'), [], first, second).minutes).toBe(23);
    expect(resolveLeg(legDay('car'), [], first, second).minutes).toBe(5);
  });

  it('warns for insufficient travel and opening-hour conflicts', () => {
    const day: TripDay = {
      id: 'day-1', label: '', placeIds: ['first', 'second'], travelMode: 'walk',
      stopSchedules: { first: { startTime: '09:00', durationMinutes: 90 }, second: { startTime: '09:40', durationMinutes: 60 } },
    };
    expect(dayWarningCount(day, [first, { ...second, openingHours: { opensAt: '10:00', closesAt: '18:00' } }], [])).toBe(2);
  });

  it('uses category defaults and preserves explicit stop schedules', () => {
    const day: TripDay = { id: 'day-1', label: '', placeIds: ['first'], stopSchedules: { first: { durationMinutes: 45 } } };

    expect(defaultDuration('Nature')).toBe(120);
    expect(scheduleFor(day, first)).toEqual({ durationMinutes: 45 });
    expect(dayWarnings({ ...day, stopSchedules: {} }, [first], [])).toEqual(new Map());
  });
});

describe('travel time agrees with resolveLeg', () => {
  const third: Place = { id: 'third', name: 'Third', region: 'Taipei', category: 'Food', latitude: 25.05, longitude: 121.58, notes: '' };
  const timed = (secondStart: string, overrides: Partial<TripDay> = {}): TripDay => ({
    id: 'day-1', label: '', placeIds: ['first', 'second'], travelMode: 'walk', timeManagementEnabled: true,
    stopSchedules: { first: { startTime: '09:00', durationMinutes: 60 }, second: { startTime: secondStart, durationMinutes: 60 } },
    ...overrides,
  });
  const insideMall: LocationCluster[] = [{
    id: 'c1', name: 'Mall', anchorPlaceId: 'first',
    members: [{ placeId: 'second', relationship: 'inside', travelMinutes: 4 }, { placeId: 'third', relationship: 'inside', travelMinutes: 6 }],
  }];

  it('uses the leg mode override', () => {
    const override = { legModeOverrides: { 'first:second': 'car' as const } };
    expect(resolveLeg(timed('10:05', override), [], first, second).minutes).toBe(5);
    expect(dayWarnings(timed('10:05', override), [first, second], [])).toEqual(new Map());
    expect(dayWarnings(timed('10:04', override), [first, second], [])).toEqual(new Map([['second', ['Insufficient travel time']]]));
    expect(nextAnchor(timed('10:05', override), [], [first, second], 'first', 'second')).toMatchObject({ travelMinutes: 5, leaveAt: '10:00' });
  });

  it('uses cluster member minutes', () => {
    const day = timed('10:04', { travelMode: 'car' });
    expect(resolveLeg(day, insideMall, first, second).minutes).toBe(4);
    expect(dayWarnings(day, [first, second], insideMall)).toEqual(new Map());
    expect(dayWarnings(timed('10:03', { travelMode: 'car' }), [first, second], insideMall)).toEqual(new Map([['second', ['Insufficient travel time']]]));
    expect(nextAnchor(day, insideMall, [first, second], 'first', 'second')).toMatchObject({ travelMinutes: 4, leaveAt: '10:00' });
  });

  it('sums every leg between timed stops across an untimed one', () => {
    const day = (thirdStart: string): TripDay => ({
      id: 'day-1', label: '', placeIds: ['first', 'second', 'third'], travelMode: 'car', timeManagementEnabled: true,
      stopSchedules: { first: { startTime: '09:00', durationMinutes: 60 }, third: { startTime: thirdStart } },
    });
    expect(dayWarnings(day('10:10'), [first, second, third], insideMall)).toEqual(new Map());
    expect(dayWarnings(day('10:09'), [first, second, third], insideMall)).toEqual(new Map([['third', ['Insufficient travel time']]]));
  });
});

describe('cascadeStartTimes', () => {
  const third: Place = { id: 'third', name: 'Third', region: 'Taipei', category: 'Food', latitude: 25.05, longitude: 121.58, notes: '' };
  const fourth: Place = { id: 'fourth', name: 'Fourth', region: 'Taipei', category: 'Food', latitude: 25.06, longitude: 121.59, notes: '' };
  const placesById = new Map([first, second, third, fourth].map((place) => [place.id, place]));
  const mall: LocationCluster[] = [{
    id: 'c1', name: 'Mall', anchorPlaceId: 'first',
    members: [{ placeId: 'second', relationship: 'inside', travelMinutes: 4 }, { placeId: 'third', relationship: 'inside', travelMinutes: 6 }],
  }];

  it('fills untimed stops from resolved legs and stops at the next timed stop', () => {
    const day: TripDay = {
      id: 'day-1', label: '', placeIds: ['first', 'second', 'third', 'fourth'], travelMode: 'car',
      stopSchedules: {
        first: { startTime: '09:00', durationMinutes: 60 },
        second: { durationMinutes: 30 },
        third: { startTime: '13:00', durationMinutes: 45 },
      },
    };

    expect(cascadeStartTimes(day, placesById, mall, 'first').stopSchedules).toEqual({
      first: { startTime: '09:00', durationMinutes: 60 },
      second: { startTime: '10:04', durationMinutes: 30 },
      third: { startTime: '13:00', durationMinutes: 45 },
    });
  });

  it('uses the leg mode override for the travel time', () => {
    const day: TripDay = {
      id: 'day-1', label: '', placeIds: ['first', 'second'], travelMode: 'walk',
      legModeOverrides: { 'first:second': 'car' },
      stopSchedules: { first: { startTime: '09:00', durationMinutes: 60 } },
    };

    expect(cascadeStartTimes(day, placesById, [], 'first').stopSchedules?.second).toEqual({ startTime: '10:05', durationMinutes: 60 });
  });

  it('leaves the day alone when the stop has no start time', () => {
    const day: TripDay = { id: 'day-1', label: '', placeIds: ['first', 'second'], stopSchedules: { first: { durationMinutes: 60 } } };
    expect(cascadeStartTimes(day, placesById, [], 'first')).toBe(day);
  });
});

describe('nextAnchor', () => {
  const day = (overrides: Partial<TripDay> = {}): TripDay => ({ id: 'day-1', label: '', placeIds: ['first', 'second'], travelMode: 'walk', ...overrides });

  it('uses the planned start time as the arrival time and subtracts travel', () => {
    const d = day({ stopSchedules: { second: { startTime: '15:30' } } });
    expect(nextAnchor(d, [], [first, second], 'first', 'second')).toEqual({
      kind: 'leaveBy', leaveAt: '15:07', arriveBy: '15:30', travelMinutes: 23, mode: 'walk', toPlaceId: 'second',
      leg: resolveLeg(d, [], first, second),
      legRef: { dayId: 'day-1', fromPlaceId: 'first', toPlaceId: 'second' },
    });
  });


  it('prefers the planned start time over closing time', () => {
    const d = day({ stopSchedules: { second: { startTime: '12:00' } } });
    const closing = { ...second, openingHours: { opensAt: '09:00', closesAt: '18:00' } };
    expect(nextAnchor(d, [], [first, closing], 'first', 'second')).toMatchObject({ arriveBy: '12:00', leaveAt: '11:37' });
  });

  it('falls back to closing time minus the stop duration', () => {
    const closing = { ...second, openingHours: { opensAt: '09:00', closesAt: '18:00' } };
    expect(nextAnchor(day(), [], [first, closing], 'first', 'second')).toMatchObject({
      kind: 'leaveBy', leaveAt: '16:37', arriveBy: '17:00', travelMinutes: 23, mode: 'walk', toPlaceId: 'second',
    });
  });

  it('returns opensAt only when there is no current place', () => {
    const opening = { ...second, openingHours: { opensAt: '09:30', closesAt: 'late' } };
    expect(nextAnchor(day(), [], [first, opening], null, 'second')).toEqual({ kind: 'opensAt', opensAt: '09:30', placeId: 'second' });
    expect(nextAnchor(day(), [], [first, opening], 'first', 'second')).toEqual({ kind: 'none' });
  });

  it('returns none without a next place or any timing data', () => {
    expect(nextAnchor(day(), [], [first, second], 'first', 'second')).toEqual({ kind: 'none' });
    expect(nextAnchor(day(), [], [first, second], 'first', null)).toEqual({ kind: 'none' });
  });

  it('returns zero travel when there is no current place', () => {
    const d = day({ stopSchedules: { second: { startTime: '10:00' } } });
    expect(nextAnchor(d, [], [second], null, 'second')).toEqual({
      kind: 'leaveBy', leaveAt: '10:00', arriveBy: '10:00', travelMinutes: 0, mode: 'walk', toPlaceId: 'second', leg: null, legRef: null,
    });
  });

  it('honours the leg mode override between current and next', () => {
    const d = day({ stopSchedules: { second: { startTime: '15:30' } }, legModeOverrides: { 'first:second': 'car' } });
    expect(nextAnchor(d, [], [first, second], 'first', 'second')).toMatchObject({
      kind: 'leaveBy', leaveAt: '15:25', arriveBy: '15:30', travelMinutes: 5, mode: 'car', toPlaceId: 'second',
    });
  });

  it('gives zero travel from a placeholder stop', () => {
    const lunch: Place = { ...first, id: 'lunch', placeholderKind: 'meal' };
    const d = day({ placeIds: ['lunch', 'second'], stopSchedules: { second: { startTime: '13:00' } } });
    expect(nextAnchor(d, [], [lunch, second], 'lunch', 'second')).toMatchObject({ kind: 'leaveBy', travelMinutes: 0, leaveAt: '13:00' });
  });

  it('clamps leaveAt at midnight', () => {
    const d = day({ stopSchedules: { second: { startTime: '00:10' } } });
    expect(nextAnchor(d, [], [first, second], 'first', 'second')).toMatchObject({ leaveAt: '00:00', arriveBy: '00:10' });
  });

  it('uses the cluster connection for stops in the same location cluster', () => {
    const clusters: LocationCluster[] = [{ id: 'c1', name: 'Mall', anchorPlaceId: 'first', members: [{ placeId: 'second', relationship: 'inside', travelMinutes: 4 }] }];
    const d = day({ travelMode: 'car', stopSchedules: { second: { startTime: '15:30' } } });
    expect(nextAnchor(d, clusters, [first, second], 'first', 'second')).toMatchObject({ kind: 'leaveBy', mode: 'walk', travelMinutes: 4, leaveAt: '15:26' });
  });
});
