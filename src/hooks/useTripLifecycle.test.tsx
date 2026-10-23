import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../data/seed';
import { listTripPlans, loadTripStateWithRevision } from '../lib/tripRepository';
import { useTripLifecycle } from './useTripLifecycle';

const authState = { accessToken: '', user: { id: 'demo', email: 'Demo mode' }, isDemo: true };

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../lib/tripRepository', () => ({
  acceptTripInvitations: vi.fn(async () => undefined),
  createTripPlan: vi.fn(),
  listTripPlans: vi.fn(),
  loadPublicTrip: vi.fn(),
  loadTripActivity: vi.fn(async () => []),
  loadTripStateWithRevision: vi.fn(),
  saveTripState: vi.fn(),
}));

describe('useTripLifecycle', () => {
  beforeEach(() => {
    authState.accessToken = '';
    authState.user = { id: 'demo', email: 'Demo mode' };
    authState.isDemo = true;
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('hydrates demo state on mount', async () => {
    const state = createInitialState();
    let currentState = state;
    const setState = vi.fn((val) => {
      if (typeof val === 'function') {
        currentState = val(currentState);
      } else {
        currentState = val;
      }
    });
    const setForcedReadOnly = vi.fn();

    const { result } = renderHook(() =>
      useTripLifecycle({
        state,
        setState,
        setForcedReadOnly,
      }),
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'));
    expect(result.current.syncError).toBeNull();
  });

  it('pauses the collaborator poll while the tab is hidden and catches up when it is visible again', async () => {
    authState.accessToken = 'token';
    authState.user = { id: 'user-1', email: 'user@example.com' };
    authState.isDemo = false;
    vi.mocked(listTripPlans).mockResolvedValue([
      { id: 'plan-1', ownerId: 'user-1', tripName: 'Trip', startDate: '2026-11-01', updatedAt: '2026-10-01T00:00:00Z', isOwner: true },
    ]);
    vi.mocked(loadTripStateWithRevision).mockResolvedValue({ state: createInitialState(), revision: 1 } as Awaited<ReturnType<typeof loadTripStateWithRevision>>);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let hidden = false;
    const hiddenSpy = vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);

    const setForcedReadOnly = vi.fn();

    try {
      const { result } = renderHook(() => {
        const [state, setState] = useState(createInitialState);
        return useTripLifecycle({ state, setState, setForcedReadOnly });
      });
      await waitFor(() => expect(result.current.isReady).toBe(true));
      const loadsAfterHydration = vi.mocked(loadTripStateWithRevision).mock.calls.length;

      hidden = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect(loadTripStateWithRevision).toHaveBeenCalledTimes(loadsAfterHydration);

      hidden = false;
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(loadTripStateWithRevision).toHaveBeenCalledTimes(loadsAfterHydration + 1);
    } finally {
      hiddenSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('persists demo state to localStorage when persistForCloudSignIn is called', async () => {
    const state = { ...createInitialState(), tripName: 'Test Save' };
    const setState = vi.fn();
    const setForcedReadOnly = vi.fn();

    const { result } = renderHook(() =>
      useTripLifecycle({
        state,
        setState,
        setForcedReadOnly,
      }),
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));

    act(() => {
      result.current.persistForCloudSignIn();
    });

    const stored = JSON.parse(localStorage.getItem('taiwan-trip-planner:demo:v1') ?? '{}');
    expect(stored.tripName).toBe('Test Save');
  });
});
