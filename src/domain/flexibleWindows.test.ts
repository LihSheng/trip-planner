import { describe, expect, it } from 'vitest';
import { createInitialState } from '../data/seed';
import type { TripState } from '../types';
import { flexibleDaysFor, flexiblePlacesForDay, normalizeFlexibleWindows, remainingWindowDays, setFlexibleWindow } from './flexibleWindows';
import { normalizeTripState } from './tripRestoration';

function stateWithUnscheduled(): TripState {
  const state = createInitialState();
  return {
    ...state,
    unscheduledIds: ['alishan', 'pier-2'],
    days: state.days.map((day) => (day.id === 'day-5' ? { ...day, placeIds: [] } : day)),
  };
}

describe('normalizeFlexibleWindows', () => {
  it('drops scheduled places, unknown days and empty windows, and orders days by trip order', () => {
    const state = {
      ...stateWithUnscheduled(),
      flexibleWindows: {
        alishan: ['day-4', 'missing-day', 'day-2', 'day-4'],
        'pier-2': ['missing-day'],
        'taipei-101': ['day-1'],
      },
    };

    expect(normalizeFlexibleWindows(state).flexibleWindows).toEqual({ alishan: ['day-2', 'day-4'] });
  });

  it('omits the field when no window remains', () => {
    const state = { ...stateWithUnscheduled(), flexibleWindows: { alishan: [] } };

    expect('flexibleWindows' in normalizeFlexibleWindows(state)).toBe(false);
  });

  it('runs as part of trip normalization', () => {
    const state = { ...stateWithUnscheduled(), flexibleWindows: { alishan: ['day-3', 'day-1'], 'taipei-101': ['day-1'] } };

    expect(normalizeTripState(state).flexibleWindows).toEqual({ alishan: ['day-1', 'day-3'] });
  });

  it('removes a deleted day from every window', () => {
    const state = setFlexibleWindow(stateWithUnscheduled(), 'alishan', ['day-2', 'day-3']);
    const withoutDay = { ...state, days: state.days.filter((day) => day.id !== 'day-2') };

    expect(normalizeFlexibleWindows(withoutDay).flexibleWindows).toEqual({ alishan: ['day-3'] });
  });

  it('removes the window when the place is scheduled into a day', () => {
    const state = setFlexibleWindow(stateWithUnscheduled(), 'alishan', ['day-2']);
    const scheduled = {
      ...state,
      unscheduledIds: ['pier-2'],
      days: state.days.map((day) => (day.id === 'day-2' ? { ...day, placeIds: [...day.placeIds, 'alishan'] } : day)),
    };

    expect('flexibleWindows' in normalizeFlexibleWindows(scheduled)).toBe(false);
  });
});

describe('flexible window queries', () => {
  const state = setFlexibleWindow(
    setFlexibleWindow(stateWithUnscheduled(), 'pier-2', ['day-5', 'day-3']),
    'alishan',
    ['day-3', 'day-1'],
  );

  it('reads the ordered window for a place', () => {
    expect(flexibleDaysFor(state, 'pier-2')).toEqual(['day-3', 'day-5']);
    expect(flexibleDaysFor(state, 'taipei-101')).toEqual([]);
  });

  it('lists flexible places for a day in unscheduled order', () => {
    expect(flexiblePlacesForDay(state, 'day-3').map((place) => place.id)).toEqual(['alishan', 'pier-2']);
    expect(flexiblePlacesForDay(state, 'day-5').map((place) => place.id)).toEqual(['pier-2']);
    expect(flexiblePlacesForDay(state, 'day-2')).toEqual([]);
  });

  it('returns window days at or after a given day', () => {
    expect(remainingWindowDays(state, 'alishan', 'day-1')).toEqual(['day-1', 'day-3']);
    expect(remainingWindowDays(state, 'alishan', 'day-3')).toEqual(['day-3']);
    expect(remainingWindowDays(state, 'alishan', 'day-4')).toEqual([]);
  });
});
