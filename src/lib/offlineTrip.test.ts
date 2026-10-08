import { beforeEach, describe, expect, it } from 'vitest';
import { createBlankTripState } from '../data/seed';
import { clearOfflineTrips, offlineTripKey, readOfflineTrip, writeOfflineTrip } from './offlineTrip';

describe('offline trip copy', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips the plan id, revision and state', () => {
    const state = createBlankTripState();
    writeOfflineTrip('user-a', 'plan-1', 4, state);
    expect(readOfflineTrip('user-a', 'plan-1')).toEqual({ planId: 'plan-1', revision: 4, state });
  });

  it('returns null when nothing is stored or the copy belongs to another plan', () => {
    expect(readOfflineTrip('user-a', 'missing')).toBeNull();
    writeOfflineTrip('user-a', 'plan-1', 1, createBlankTripState());
    window.localStorage.setItem(offlineTripKey('user-a', 'plan-2'), window.localStorage.getItem(offlineTripKey('user-a', 'plan-1'))!);
    expect(readOfflineTrip('user-a', 'plan-2')).toBeNull();
  });

  it('returns null for corrupt data', () => {
    window.localStorage.setItem(offlineTripKey('user-a', 'plan-1'), '{not json');
    expect(readOfflineTrip('user-a', 'plan-1')).toBeNull();
  });

  it('does not expose one user\'s copy to another user', () => {
    writeOfflineTrip('user-a', 'plan-1', 1, createBlankTripState());
    expect(readOfflineTrip('user-b', 'plan-1')).toBeNull();
  });

  it('clears only the given user\'s copies', () => {
    writeOfflineTrip('user-a', 'plan-1', 1, createBlankTripState());
    writeOfflineTrip('user-a', 'plan-2', 1, createBlankTripState());
    writeOfflineTrip('user-b', 'plan-1', 1, createBlankTripState());
    window.localStorage.setItem('unrelated', 'keep');

    clearOfflineTrips('user-a');

    expect(readOfflineTrip('user-a', 'plan-1')).toBeNull();
    expect(readOfflineTrip('user-a', 'plan-2')).toBeNull();
    expect(readOfflineTrip('user-b', 'plan-1')).not.toBeNull();
    expect(window.localStorage.getItem('unrelated')).toBe('keep');
  });
});
