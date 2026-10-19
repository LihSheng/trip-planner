import { describe, expect, it } from 'vitest';
import { defaultDuration, scheduleFor, toMinutes, toTime } from './schedule';
import type { Place, TripDay } from '../types';
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

  it('uses category defaults and preserves explicit stop schedules', () => {
    const day: TripDay = { id: 'day-1', label: '', placeIds: ['first'], stopSchedules: { first: { durationMinutes: 45 } } };

    expect(defaultDuration('Nature')).toBe(120);
    expect(scheduleFor(day, first)).toEqual({ durationMinutes: 45 });
  });
});
