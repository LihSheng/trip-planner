import type { TripState } from '../types';
import { ensureActivities } from './activity';
import { normalizeDayTasks } from './dayTask';
import { normalizeExpenseState } from './expenses';
import { ensureItineraryEntries } from './itinerary';
import { normalizeLocationClusters } from './locationCluster';
import { normalizePlace } from './place';

export interface RestoredTrip {
  state: TripState;
  readOnly: boolean;
  error?: string;
}

export type TripRestoration =
  | { ok: true; trip: RestoredTrip }
  | { ok: false; error: string };

export function isTripState(value: unknown): value is TripState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TripState>;
  return (
    candidate.version === 1 &&
    typeof candidate.tripName === 'string' &&
    typeof candidate.startDate === 'string' &&
    Array.isArray(candidate.places) &&
    Array.isArray(candidate.unscheduledIds) &&
    Array.isArray(candidate.days)
  );
}

export function normalizeTripState(state: TripState): TripState {
  const normalized = {
    ...state,
    places: state.places.map(normalizePlace),
    visitedPlaceIds: Array.isArray(state.visitedPlaceIds)
      ? state.visitedPlaceIds.filter((placeId): placeId is string => typeof placeId === 'string')
      : [],
    days: state.days.map((day) => ({
      ...day,
      travelMode: day.travelMode ?? 'public',
      stopSchedules: day.stopSchedules ?? {},
      timeManagementEnabled: day.timeManagementEnabled ?? false,
      legModeOverrides: day.legModeOverrides ?? {},
    })),
    executionByDay: state.executionByDay ?? {},
    expenses: Array.isArray(state.expenses) ? state.expenses : [],
    dayTasks: normalizeDayTasks(state),
    displayCurrency: state.displayCurrency ?? 'MYR',
  };

  return normalizeExpenseState(ensureActivities(ensureItineraryEntries({
    ...normalized,
    locationClusters: normalizeLocationClusters(normalized),
  })));
}

export function restoreTripState(value: unknown): TripRestoration {
  if (!isTripState(value)) {
    return { ok: false, error: 'The saved trip has an unsupported data format.' };
  }

  try {
    return { ok: true, trip: { state: normalizeTripState(value), readOnly: false } };
  } catch (reason) {
    return {
      ok: true,
      trip: {
        state: value,
        readOnly: true,
        error: reason instanceof Error ? reason.message : 'The saved trip could not be migrated safely.',
      },
    };
  }
}
