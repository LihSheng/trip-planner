import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../types';
import { createInitialState } from '../data/seed';
import { createTripPlan, listTripPlans, loadPublicTrip, loadTripStateWithRevision, saveTripState } from '../lib/tripRepository';

const authState = { accessToken: '', user: { id: 'demo', email: 'Demo mode' }, isDemo: true };

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../lib/tripRepository', async () => {
  const actual = await vi.importActual<typeof import('../lib/tripRepository')>('../lib/tripRepository');
  return {
    ...actual,
    acceptTripInvitations: vi.fn(),
    createTripPlan: vi.fn(),
    listTripPlans: vi.fn(),
    loadPublicTrip: vi.fn(),
    loadTripStateWithRevision: vi.fn(),
    loadTripActivity: vi.fn().mockResolvedValue([]),
    saveTripState: vi.fn(),
  };
});

import { useTripPlanner } from './useTripPlanner';

const hotel: Place = {
  id: 'hotel', name: 'Hotel', region: 'Taipei', category: 'Accommodation', latitude: 25.04, longitude: 121.56, notes: '',
};

const planOneState = { ...createInitialState(), tripName: 'Taiwan Adventure' };
const planTwoState = { ...createInitialState(), tripName: 'Japan Spring' };
const cloudPlans = [
  { id: 'plan-1', ownerId: 'cloud-user', tripName: 'Taiwan Adventure', startDate: '2026-11-07', updatedAt: '2026-01-01T00:00:00Z', isOwner: true },
  { id: 'plan-2', ownerId: 'friend-user', tripName: 'Japan Spring', startDate: '2027-04-01', updatedAt: '2026-01-02T00:00:00Z', isOwner: false },
];

describe('useTripPlanner', () => {
  beforeEach(() => {
    authState.accessToken = '';
    authState.user = { id: 'demo', email: 'Demo mode' };
    authState.isDemo = true;
    vi.mocked(loadPublicTrip).mockReset();
    vi.mocked(createTripPlan).mockReset();
    vi.mocked(listTripPlans).mockReset();
    vi.mocked(loadTripStateWithRevision).mockReset();
    vi.mocked(saveTripState).mockReset();
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

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

    await act(async () => hook.result.current.updatePlace({ ...hotel, category: 'Landmark', name: 'Renamed' }));
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
    const placeholder = hook.result.current.state.places.find((place) => place.placeholderKind);
    expect(placeholder?.placeholderKind).toBe('meal');
    expect(hook.result.current.state.days[0].placeIds).toContain(placeholder?.id);

    await act(async () => hook.result.current.replacePlaceholder(placeholder!.id, { ...hotel, id: 'lunch-place', name: 'Lunch place' }));
    expect(hook.result.current.state.places.some((place) => place.id === placeholder?.id)).toBe(false);
    expect(hook.result.current.state.days[0].placeIds).toContain('lunch-place');
  });

  it('fills a planned stop with an unscheduled place in the same route position', async () => {
    const hook = await planner();
    const dayId = hook.result.current.state.days[0].id;
    await act(async () => hook.result.current.addPlaceholderToDay(dayId, 'coffee'));
    const placeholderId = hook.result.current.state.places.find((place) => place.placeholderKind)!.id;

    await act(async () => hook.result.current.fillPlaceholder(placeholderId, 'alishan'));
    const day = hook.result.current.state.days[0];
    expect(day.placeIds).toContain('alishan');
    expect(hook.result.current.state.unscheduledIds).not.toContain('alishan');
    expect(hook.result.current.state.places.some((place) => place.id === placeholderId)).toBe(false);
  });

  it('records an expense without changing itinerary planning data', async () => {
    const hook = await planner();
    const dayId = hook.result.current.state.days[0].id;
    await act(async () => hook.result.current.addExpense({
      id: 'expense-1', dayId, placeId: 'taipei-101', amount: 350, currency: 'TWD', category: 'food', createdAt: '2026-11-07T10:00:00.000Z',
    }));
    expect(hook.result.current.state.expenses).toEqual([expect.objectContaining({ amount: 350, category: 'food', placeId: 'taipei-101' })]);
    expect(hook.result.current.state.days[0].placeIds).toEqual(['taipei-101', 'ximending']);
  });

  it('creates the first cloud plan, selects it, and reports save failures', async () => {
    authState.accessToken = 'token';
    authState.user = { id: 'cloud-user', email: 'cloud@example.com' };
    authState.isDemo = false;
    vi.mocked(listTripPlans)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'plan-1', ownerId: 'cloud-user', tripName: 'Untitled trip', startDate: '2026-01-01', updatedAt: '2026-01-01T00:00:00Z', isOwner: true }]);
    vi.mocked(createTripPlan).mockResolvedValue('plan-1');
    vi.mocked(loadTripStateWithRevision).mockResolvedValue({ state: createInitialState(), revision: 0 });
    vi.mocked(saveTripState).mockResolvedValue(1);

    const hook = await planner();
    expect(createTripPlan).toHaveBeenCalledWith('token', 'cloud-user', expect.objectContaining({ version: 1 }));
    expect(loadTripStateWithRevision).toHaveBeenCalledWith('token', 'plan-1');
    expect(hook.result.current.planId).toBe('plan-1');
    expect(hook.result.current.syncStatus).toBe('saved');

    vi.mocked(saveTripState).mockRejectedValueOnce(new Error('Network unavailable'));
    await act(async () => hook.result.current.syncNow());
    expect(hook.result.current).toMatchObject({ syncStatus: 'error', syncError: 'Network unavailable' });
  });

  it('keeps both collaborators new places when a stale save conflicts', async () => {
    authState.accessToken = 'token';
    authState.user = { id: 'cloud-user', email: 'cloud@example.com' };
    authState.isDemo = false;
    vi.mocked(listTripPlans).mockResolvedValue(cloudPlans);

    const collaboratorAPlace = { ...hotel, id: 'place-a', name: 'Place from A' };
    const collaboratorBPlace = { ...hotel, id: 'place-b', name: 'Place from B' };
    const initial = createInitialState();
    const latest = {
      ...initial,
      places: [...initial.places, collaboratorAPlace],
      unscheduledIds: [...initial.unscheduledIds, collaboratorAPlace.id],
    };
    vi.mocked(loadTripStateWithRevision)
      .mockResolvedValueOnce({ state: initial, revision: 0 })
      .mockResolvedValueOnce({ state: latest, revision: 1 });
    vi.mocked(saveTripState)
      .mockRejectedValueOnce(new Error('TRIP_CONFLICT'))
      .mockResolvedValueOnce(2);

    const hook = await planner();
    vi.useFakeTimers();
    act(() => hook.result.current.addPlace(collaboratorBPlace));
    await act(async () => vi.advanceTimersByTimeAsync(700));
    await act(async () => vi.advanceTimersByTimeAsync(700));

    expect(hook.result.current.state.places).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: collaboratorAPlace.id }),
      expect.objectContaining({ id: collaboratorBPlace.id }),
    ]));
    expect(hook.result.current.state.unscheduledIds).toEqual(expect.arrayContaining([
      collaboratorAPlace.id,
      collaboratorBPlace.id,
    ]));
    expect(saveTripState).toHaveBeenLastCalledWith(
      'token',
      'plan-1',
      expect.objectContaining({ places: expect.arrayContaining([
        expect.objectContaining({ id: collaboratorAPlace.id }),
        expect.objectContaining({ id: collaboratorBPlace.id }),
      ]) }),
      1,
      expect.any(Array),
    );
    expect(hook.result.current.syncStatus).toBe('saved');
  });

  it('refreshes a clean plan when another collaborator saves', async () => {
    authState.accessToken = 'token';
    authState.user = { id: 'cloud-user', email: 'cloud@example.com' };
    authState.isDemo = false;
    vi.mocked(listTripPlans).mockResolvedValue(cloudPlans);

    const collaboratorPlace = { ...hotel, id: 'place-a', name: 'Place from A' };
    const initial = createInitialState();
    vi.mocked(loadTripStateWithRevision)
      .mockResolvedValueOnce({ state: initial, revision: 0 })
      .mockResolvedValueOnce({
        state: {
          ...initial,
          places: [...initial.places, collaboratorPlace],
          unscheduledIds: [...initial.unscheduledIds, collaboratorPlace.id],
        },
        revision: 1,
      });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    const hook = await planner();
    await act(async () => vi.advanceTimersByTimeAsync(4_000));

    expect(hook.result.current.placesById.get(collaboratorPlace.id)).toMatchObject({
      name: 'Place from A',
    });
    expect(hook.result.current.syncStatus).toBe('saved');
  });

  it('opens the requested plan id before stored or most-recent plans', async () => {
    authState.accessToken = 'token';
    authState.user = { id: 'cloud-user', email: 'cloud@example.com' };
    authState.isDemo = false;
    localStorage.setItem('trip-planner:selected-plan:cloud-user', 'plan-1');
    vi.mocked(listTripPlans).mockResolvedValue(cloudPlans);
    vi.mocked(loadTripStateWithRevision).mockResolvedValue({ state: planTwoState, revision: 0 });
    vi.mocked(saveTripState).mockResolvedValue(1);

    const hook = renderHook(() => useTripPlanner(undefined, 'plan-2'));
    await waitFor(() => expect(hook.result.current.isReady).toBe(true));

    expect(loadTripStateWithRevision).toHaveBeenCalledWith('token', 'plan-2');
    expect(hook.result.current.planId).toBe('plan-2');
    expect(hook.result.current.state.tripName).toBe('Japan Spring');
    expect(hook.result.current.activePlan).toMatchObject({ id: 'plan-2', isOwner: false });
    expect(hook.result.current.isOwner).toBe(false);
    expect(localStorage.getItem('trip-planner:selected-plan:cloud-user')).toBe('plan-2');
  });

  it('switches plans and creates a blank plan even when the refreshed list lags', async () => {
    authState.accessToken = 'token';
    authState.user = { id: 'cloud-user', email: 'cloud@example.com' };
    authState.isDemo = false;
    vi.mocked(listTripPlans)
      .mockResolvedValueOnce(cloudPlans)
      .mockResolvedValueOnce(cloudPlans);
    vi.mocked(loadTripStateWithRevision)
      .mockResolvedValueOnce({ state: planOneState, revision: 0 })
      .mockResolvedValueOnce({ state: planTwoState, revision: 0 });
    vi.mocked(createTripPlan).mockResolvedValue('plan-3');
    vi.mocked(saveTripState).mockResolvedValue(1);

    const hook = await planner();
    expect(hook.result.current.planId).toBe('plan-1');

    await act(async () => hook.result.current.switchPlan('plan-2'));
    expect(loadTripStateWithRevision).toHaveBeenLastCalledWith('token', 'plan-2');
    expect(hook.result.current).toMatchObject({ planId: 'plan-2', isOwner: false });

    await act(async () => {
      await hook.result.current.createPlan();
    });

    expect(createTripPlan).toHaveBeenCalledWith('token', 'cloud-user', expect.objectContaining({ tripName: 'Untitled trip', places: [] }));
    expect(hook.result.current.planId).toBe('plan-3');
    expect(hook.result.current.state).toMatchObject({ tripName: 'Untitled trip', places: [] });
    expect(hook.result.current.plans[0]).toMatchObject({ id: 'plan-3', isOwner: true });
    expect(localStorage.getItem('trip-planner:selected-plan:cloud-user')).toBe('plan-3');
  });

  it('loads shared trips as read-only and prevents all planner mutations', async () => {
    const sharedState = structuredClone(createInitialState());
    vi.mocked(loadPublicTrip).mockResolvedValue(sharedState);

    const hook = renderHook(() => useTripPlanner('shared-token'));
    await waitFor(() => expect(hook.result.current.isReady).toBe(true));
    const original = structuredClone(hook.result.current.state);

    await act(async () => {
      hook.result.current.addPlace(hotel);
      hook.result.current.updateTrip('Changed', '2027-01-01');
      hook.result.current.removePlace('taipei-101');
      await hook.result.current.syncNow();
    });

    expect(loadPublicTrip).toHaveBeenCalledWith('shared-token');
    expect(hook.result.current.isReadOnly).toBe(true);
    expect(hook.result.current.state).toEqual(original);
    expect(saveTripState).not.toHaveBeenCalled();
  });
});
