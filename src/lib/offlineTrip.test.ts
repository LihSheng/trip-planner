import { beforeEach, describe, expect, it } from 'vitest';
import { createBlankTripState } from '../data/seed';
import { offlineTripKey, readOfflineTrip, writeOfflineTrip } from './offlineTrip';

describe('offline trip copy', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips the plan id, revision and state', () => {
    const state = createBlankTripState();
    writeOfflineTrip('plan-1', 4, state);
    expect(readOfflineTrip('plan-1')).toEqual({ planId: 'plan-1', revision: 4, state });
  });

  it('returns null when nothing is stored or the copy belongs to another plan', () => {
    expect(readOfflineTrip('missing')).toBeNull();
    writeOfflineTrip('plan-1', 1, createBlankTripState());
    window.localStorage.setItem(offlineTripKey('plan-2'), window.localStorage.getItem(offlineTripKey('plan-1'))!);
    expect(readOfflineTrip('plan-2')).toBeNull();
  });

  it('returns null for corrupt data', () => {
    window.localStorage.setItem(offlineTripKey('plan-1'), '{not json');
    expect(readOfflineTrip('plan-1')).toBeNull();
  });
});
