import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { Place, TripState } from '../types';
import { TodayModePage } from './TodayModePage';
import { TransitSheetProvider } from './TransitSheet';

let tripState: TripState;
vi.mock('../context/TripContext', () => ({
  useTrip: () => ({
    state: tripState,
    placesById: new Map(tripState.places.map((place) => [place.id, place])),
    isReadOnly: false,
    updateExecution: vi.fn(), updatePlace: vi.fn(), addExpense: vi.fn(), toggleDayTask: vi.fn(), deleteDayTask: vi.fn(), moveDayTask: vi.fn(), toggleVisited: vi.fn(),
  }),
}));
vi.mock('../context/AuthContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../context/AuthContext')>(),
  useAuth: () => ({ isAuthenticated: false, user: { id: 'demo' }, accessToken: '' }),
}));
vi.mock('../lib/exchangeRates', () => ({ getTwdExchangeRate: () => Promise.resolve(null) }));

const first: Place = { id: 'first', name: 'Taipei Main', region: 'Taipei', category: 'Station', latitude: 25.03, longitude: 121.56, notes: '' };
const second: Place = { id: 'second', name: 'Jiufen', region: 'Ruifang', category: 'Landmark', latitude: 25.04, longitude: 121.57, notes: '' };

function renderToday() {
  render(<MantineProvider env="test"><I18nProvider><TransitSheetProvider><TodayModePage location={{ location: null, isTracking: false, permission: 'prompt' } as never} /></TransitSheetProvider></I18nProvider></MantineProvider>);
}

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
    renderToday();
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
    renderToday();
    expect(screen.getByText('Leave by 09:37 to reach Jiufen before 10:00 · Walk 23 min')).toBeTruthy();
    expect(screen.queryByText(/Leave now/)).toBeNull();
  });

  it('offers transit on a public transport leg and suggests a refresh for an old saved route', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T09:00:00'));
    tripState = {
      version: 1, tripName: 'Taiwan', startDate: '2026-10-10', places: [first, second], unscheduledIds: [], visitedPlaceIds: [],
      days: [{
        id: 'day-1', label: '', placeIds: ['first', 'second'], travelMode: 'public', stopSchedules: { second: { startTime: '11:00' } },
        transitByLeg: {
          'first:second': {
            provider: 'mock', fetchedAt: '2026-10-01T01:00:00.000Z', options: [],
            basis: { from: { lat: 25.03, lng: 121.56 }, to: { lat: 25.04, lng: 121.57 }, departAt: '2026-10-01T09:00:00+08:00' },
          },
        },
      }],
      executionByDay: { 'day-1': { dayId: 'day-1', selectedAt: '', updatedAt: '', stopStates: { first: { placeId: 'first', status: 'current' } } } },
    };
    renderToday();

    fireEvent.click(screen.getByRole('button', { name: 'Show transit · refresh suggested' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Saved Oct 1')).toBeTruthy();
    expect(within(dialog).getByText('Sample data')).toBeTruthy();
  });

  it('does not offer transit on a walking leg', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T09:00:00'));
    tripState = {
      version: 1, tripName: 'Taiwan', startDate: '2026-10-10', places: [first, second], unscheduledIds: [], visitedPlaceIds: [],
      days: [{ id: 'day-1', label: '', placeIds: ['first', 'second'], travelMode: 'walk', stopSchedules: { second: { startTime: '11:00' } } }],
      executionByDay: { 'day-1': { dayId: 'day-1', selectedAt: '', updatedAt: '', stopStates: { first: { placeId: 'first', status: 'current' } } } },
    };
    renderToday();
    expect(screen.queryByRole('button', { name: /Show transit/ })).toBeNull();
  });
});
