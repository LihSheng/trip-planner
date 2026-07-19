import { describe, expect, it } from 'vitest';
import { dayWarningCount, estimateTravelMinutes, toMinutes, toTime } from './schedule';
import type { Place, TripDay } from '../types';

const first: Place = { id: 'first', name: 'First', region: 'Taipei', category: 'Landmark', latitude: 25.03, longitude: 121.56, notes: '' };
const second: Place = { id: 'second', name: 'Second', region: 'Taipei', category: 'Food', latitude: 25.04, longitude: 121.57, notes: '' };

describe('schedule helpers', () => {
  it('formats 24-hour values', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toTime(570)).toBe('09:30');
  });

  it('uses transport modes for distance estimates', () => {
    expect(estimateTravelMinutes(first, second, 'walk')).toBeGreaterThan(estimateTravelMinutes(first, second, 'car'));
  });

  it('warns for insufficient travel and opening-hour conflicts', () => {
    const day: TripDay = {
      id: 'day-1', label: '', placeIds: ['first', 'second'], travelMode: 'walk',
      stopSchedules: { first: { startTime: '09:00', durationMinutes: 90 }, second: { startTime: '09:40', durationMinutes: 60 } },
    };
    expect(dayWarningCount(day, [first, { ...second, openingHours: { opensAt: '10:00', closesAt: '18:00' } }])).toBe(2);
  });
});
