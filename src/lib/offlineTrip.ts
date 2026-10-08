import type { TripState } from '../types';

export interface OfflineTripCopy {
  planId: string;
  revision: number;
  state: TripState;
}

const OFFLINE_KEY_PREFIX = 'trip-planner:offline:';

export function offlineTripKey(userId: string, planId: string) {
  return `${OFFLINE_KEY_PREFIX}${userId}:${planId}`;
}

export function writeOfflineTrip(userId: string, planId: string, revision: number, state: TripState) {
  try {
    window.localStorage.setItem(offlineTripKey(userId, planId), JSON.stringify({ planId, revision, state }));
  } catch {
    return;
  }
}

export function readOfflineTrip(userId: string, planId: string): OfflineTripCopy | null {
  try {
    const stored = window.localStorage.getItem(offlineTripKey(userId, planId));
    if (!stored) return null;
    const copy = JSON.parse(stored) as Partial<OfflineTripCopy> | null;
    if (!copy || copy.planId !== planId || typeof copy.revision !== 'number' || !copy.state) return null;
    return copy as OfflineTripCopy;
  } catch {
    return null;
  }
}

export function clearOfflineTrips(userId: string) {
  try {
    const prefix = `${OFFLINE_KEY_PREFIX}${userId}:`;
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index));
    keys.filter((key): key is string => key?.startsWith(prefix) ?? false).forEach((key) => window.localStorage.removeItem(key));
  } catch {
    return;
  }
}
