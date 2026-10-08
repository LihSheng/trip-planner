import type { TripState } from '../types';

export interface OfflineTripCopy {
  planId: string;
  revision: number;
  state: TripState;
}

export function offlineTripKey(planId: string) {
  return `trip-planner:offline:${planId}`;
}

export function writeOfflineTrip(planId: string, revision: number, state: TripState) {
  try {
    window.localStorage.setItem(offlineTripKey(planId), JSON.stringify({ planId, revision, state }));
  } catch {
    return;
  }
}

export function readOfflineTrip(planId: string): OfflineTripCopy | null {
  try {
    const stored = window.localStorage.getItem(offlineTripKey(planId));
    if (!stored) return null;
    const copy = JSON.parse(stored) as Partial<OfflineTripCopy> | null;
    if (!copy || copy.planId !== planId || typeof copy.revision !== 'number' || !copy.state) return null;
    return copy as OfflineTripCopy;
  } catch {
    return null;
  }
}
