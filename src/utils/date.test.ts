import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import { defaultTodayDay, localDateKey, tripDayDate } from './date';

describe('trip dates', () => {
  it('keys dates by the local calendar day, not UTC', () => {
    expect(localDateKey(new Date(2026, 10, 8, 0, 30))).toBe('2026-11-08');
    expect(localDateKey(new Date(2026, 10, 8, 23, 30))).toBe('2026-11-08');
  });

  it('matches today to the trip day on that calendar date', () => {
    const state = createInitialState();
    expect(tripDayDate(state.startDate, 1)).toBe('2026-11-08');
    expect(defaultTodayDay(state, '2026-11-08')?.id).toBe(state.days[1].id);
  });
});
