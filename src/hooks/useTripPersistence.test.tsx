import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../data/seed';
import { useTripPersistence } from './useTripPersistence';

const authState = { accessToken: '', user: { id: 'demo', email: 'Demo mode' }, isDemo: true };

vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));

describe('useTripPersistence', () => {
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
    const setPlanId = vi.fn();
    const setPlans = vi.fn();

    const { result } = renderHook(() =>
      useTripPersistence({
        state,
        setState,
        planId: null,
        setPlanId,
        setPlans,
      }),
    );

    await waitFor(() => expect(result.current.isReady).toBe(true));
    await waitFor(() => expect(result.current.syncStatus).toBe('saved'));
    expect(result.current.syncError).toBeNull();
  });

  it('persists demo state to localStorage when persistForCloudSignIn is called', async () => {
    const state = { ...createInitialState(), tripName: 'Test Save' };
    const setState = vi.fn();
    const setPlanId = vi.fn();
    const setPlans = vi.fn();

    const { result } = renderHook(() =>
      useTripPersistence({
        state,
        setState,
        planId: null,
        setPlanId,
        setPlans,
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
