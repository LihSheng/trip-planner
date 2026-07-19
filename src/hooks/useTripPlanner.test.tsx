import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../types';

const authState = { accessToken: '', user: { id: 'demo', email: 'Demo mode' }, isDemo: true };

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../lib/tripRepository', async () => {
  const actual = await vi.importActual<typeof import('../lib/tripRepository')>('../lib/tripRepository');
  return {
    ...actual,
    acceptTripInvitations: vi.fn(),
    loadSharedTripOwnerId: vi.fn(),
    loadTripState: vi.fn(),
    saveTripState: vi.fn(),
  };
});

import { useTripPlanner } from './useTripPlanner';

const hotel: Place = {
  id: 'hotel', name: 'Hotel', region: 'Taipei', category: 'Relaxation', latitude: 25.04, longitude: 121.56, notes: '', type: 'hotel',
};

describe('useTripPlanner', () => {
  afterEach(() => localStorage.clear());

  async function planner() {
    const hook = renderHook(() => useTripPlanner());
    await waitFor(() => expect(hook.result.current.isReady).toBe(true));
    return hook;
  }

  it('adds, updates, and fully removes places', async () => {
    const hook = await planner();
    await act(async () => hook.result.current.addPlace(hotel));
    expect(hook.result.current.state.hotelPlaceId).toBe('hotel');
    expect(hook.result.current.state.unscheduledIds).toContain('hotel');

    await act(async () => hook.result.current.updatePlace({ ...hotel, type: 'place', name: 'Renamed' }));
    expect(hook.result.current.state.hotelPlaceId).toBeUndefined();
    expect(hook.result.current.placesById.get('hotel')?.name).toBe('Renamed');

    await act(async () => hook.result.current.removePlace('taipei-101'));
    expect(hook.result.current.state.places.some((place) => place.id === 'taipei-101')).toBe(false);
    expect(hook.result.current.state.days[0].placeIds).not.toContain('taipei-101');
  });

  it('changes days, visits, and schedule data', async () => {
    const hook = await planner();
    const firstDay = hook.result.current.state.days[0];

    await act(async () => {
      hook.result.current.toggleVisited('taipei-101');
      hook.result.current.updateDayLabel(firstDay.id, 'Arrival');
      hook.result.current.updateDaySchedule(firstDay.id, { timeManagementEnabled: true, startTime: '09:00', travelMode: 'walk' });
      hook.result.current.updateStopSchedule(firstDay.id, 'taipei-101', { startTime: '10:00', durationMinutes: 60 });
    });
    const changed = hook.result.current.state.days[0];
    expect(hook.result.current.state.visitedPlaceIds).toContain('taipei-101');
    expect(changed).toMatchObject({ label: 'Arrival', travelMode: 'walk', timeManagementEnabled: true });
    expect(changed.stopSchedules?.['taipei-101']).toMatchObject({ startTime: '10:00', durationMinutes: 60 });
    expect(changed.stopSchedules?.ximending?.startTime).toMatch(/^\d{2}:\d{2}$/);

    await act(async () => hook.result.current.removeDay(firstDay.id));
    expect(hook.result.current.state.days.some((day) => day.id === firstDay.id)).toBe(false);
    expect(hook.result.current.state.unscheduledIds).toEqual(expect.arrayContaining(['taipei-101', 'ximending']));
  });

  it('reorders, moves, updates trip metadata, and persists demo state for sign-in', async () => {
    const hook = await planner();
    await act(async () => {
      hook.result.current.reorderDays(0, 1);
      hook.result.current.move('alishan', 'day-1', 0);
      hook.result.current.updateTrip('Updated trip', '2027-01-02');
    });
    await act(async () => hook.result.current.persistForCloudSignIn());

    expect(hook.result.current.state.days[0].id).toBe('day-2');
    expect(hook.result.current.state.days.find((day) => day.id === 'day-1')?.placeIds[0]).toBe('alishan');
    expect(hook.result.current.state).toMatchObject({ tripName: 'Updated trip', startDate: '2027-01-02' });
    expect(JSON.parse(localStorage.getItem('taiwan-trip-planner:demo:v1') ?? '{}')).toMatchObject({ tripName: 'Updated trip' });
  });

  it('keeps planned stops in a day and replaces one with a real place', async () => {
    const hook = await planner();
    const dayId = hook.result.current.state.days[0].id;
    await act(async () => hook.result.current.addPlaceholderToDay(dayId, 'meal'));
    const placeholder = hook.result.current.state.places.find((place) => place.type === 'placeholder');
    expect(placeholder?.placeholderKind).toBe('meal');
    expect(hook.result.current.state.days[0].placeIds).toContain(placeholder?.id);

    await act(async () => hook.result.current.replacePlaceholder(placeholder!.id, { ...hotel, id: 'lunch-place', name: 'Lunch place' }));
    expect(hook.result.current.state.places.some((place) => place.id === placeholder?.id)).toBe(false);
    expect(hook.result.current.state.days[0].placeIds).toContain('lunch-place');
  });
});
