import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { Place, TripState } from '../types';
import { TodayModePage } from './TodayModePage';

let tripState: TripState;
vi.mock('../context/TripContext', () => ({
  useTrip: () => ({
    state: tripState,
    placesById: new Map(tripState.places.map((place) => [place.id, place])),
    isReadOnly: false,
    updateExecution: vi.fn(), updatePlace: vi.fn(), addExpense: vi.fn(), toggleDayTask: vi.fn(), deleteDayTask: vi.fn(), moveDayTask: vi.fn(), toggleVisited: vi.fn(),
  }),
}));
vi.mock('../lib/exchangeRates', () => ({ getTwdExchangeRate: () => Promise.resolve(null) }));

const first: Place = { id: 'first', name: 'Taipei Main', region: 'Taipei', category: 'Station', latitude: 25.03, longitude: 121.56, notes: '' };
const second: Place = { id: 'second', name: 'Jiufen', region: 'Ruifang', category: 'Landmark', latitude: 25.04, longitude: 121.57, notes: '' };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TodayModePage', () => {
  it('shows a leave-by line for the next stop with a planned start time', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T09:00:00'));
    tripState = {
      version: 1, tripName: 'Taiwan', startDate: '2026-10-10', places: [first, second], unscheduledIds: [], visitedPlaceIds: [],
      days: [{ id: 'day-1', label: '', placeIds: ['first', 'second'], travelMode: 'walk', stopSchedules: { second: { startTime: '23:30' } } }],
      executionByDay: { 'day-1': { dayId: 'day-1', selectedAt: '', updatedAt: '', stopStates: { first: { placeId: 'first', status: 'current' } } } },
    };
    render(<MantineProvider env="test"><I18nProvider><TodayModePage location={{ location: null, isTracking: false, permission: 'prompt' } as never} /></I18nProvider></MantineProvider>);
    expect(screen.getByText('Leave by 23:07 to reach Jiufen before 23:30 · Walk 23 min')).toBeTruthy();
  });

  it('does not say leave now for a day other than today', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T15:00:00'));
    tripState = {
      version: 1, tripName: 'Taiwan', startDate: '2026-10-11', places: [first, second], unscheduledIds: [], visitedPlaceIds: [],
      days: [{ id: 'day-1', label: '', placeIds: ['first', 'second'], travelMode: 'walk', stopSchedules: { second: { startTime: '10:00' } } }],
      executionByDay: { 'day-1': { dayId: 'day-1', selectedAt: '', updatedAt: '', stopStates: { first: { placeId: 'first', status: 'current' } } } },
    };
    render(<MantineProvider env="test"><I18nProvider><TodayModePage location={{ location: null, isTracking: false, permission: 'prompt' } as never} /></I18nProvider></MantineProvider>);
    expect(screen.getByText('Leave by 09:37 to reach Jiufen before 10:00 · Walk 23 min')).toBeTruthy();
    expect(screen.queryByText(/Leave now/)).toBeNull();
  });
});
