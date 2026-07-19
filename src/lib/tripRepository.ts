import type { TripState } from '../types';
import { supabasePublishableKey, supabaseUrl } from './supabaseConfig';

interface TripRow {
  state: unknown;
}

function dataHeaders(accessToken: string, additional?: Record<string, string>): HeadersInit {
  return {
    apikey: supabasePublishableKey,
    Authorization: `Bearer ${accessToken}`,
    ...additional,
  };
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string; details?: string; hint?: string };
    return [payload.message, payload.details, payload.hint].filter(Boolean).join(' — ') || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

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

function normalizeTripState(state: TripState): TripState {
  return {
    ...state,
    visitedPlaceIds: Array.isArray(state.visitedPlaceIds)
      ? state.visitedPlaceIds.filter((placeId): placeId is string => typeof placeId === 'string')
      : [],
    days: state.days.map((day) => ({
      ...day,
      travelMode: day.travelMode ?? 'public',
      stopSchedules: day.stopSchedules ?? {},
      timeManagementEnabled: day.timeManagementEnabled ?? false,
    })),
  };
}

export async function loadTripState(accessToken: string, userId: string): Promise<TripState | null> {
  const query = new URLSearchParams({
    select: 'state',
    user_id: `eq.${userId}`,
    limit: '1',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/trip_plans?${query.toString()}`, {
    headers: dataHeaders(accessToken),
  });

  if (!response.ok) throw new Error(await parseError(response));
  const rows = (await response.json()) as TripRow[];
  if (!rows[0]) return null;
  if (!isTripState(rows[0].state)) throw new Error('The saved trip has an unsupported data format.');
  return normalizeTripState(rows[0].state);
}

export async function saveTripState(
  accessToken: string,
  userId: string,
  state: TripState,
): Promise<void> {
  const query = new URLSearchParams({ on_conflict: 'user_id' });
  const response = await fetch(`${supabaseUrl}/rest/v1/trip_plans?${query.toString()}`, {
    method: 'POST',
    headers: dataHeaders(accessToken, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify({
      user_id: userId,
      state,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) throw new Error(await parseError(response));
}
