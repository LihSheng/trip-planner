import type { Place, TripState } from '../types';

function sameWindows(left: Record<string, string[]>, right: Record<string, string[]>) {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => right[key]?.length === left[key].length && right[key].every((dayId, index) => dayId === left[key][index]));
}

export function normalizeFlexibleWindows(state: TripState): TripState {
  if (!state.flexibleWindows) return state;
  const unscheduled = new Set(state.unscheduledIds);
  const dayIndex = new Map(state.days.map((day, index) => [day.id, index]));
  const windows: Record<string, string[]> = {};
  for (const [placeId, dayIds] of Object.entries(state.flexibleWindows)) {
    if (!unscheduled.has(placeId) || !Array.isArray(dayIds)) continue;
    const valid = [...new Set(dayIds)]
      .filter((dayId) => dayIndex.has(dayId))
      .sort((left, right) => dayIndex.get(left)! - dayIndex.get(right)!);
    if (valid.length) windows[placeId] = valid;
  }
  if (sameWindows(state.flexibleWindows, windows)) return state;
  const { flexibleWindows: _removed, ...rest } = state;
  return Object.keys(windows).length ? { ...rest, flexibleWindows: windows } : rest;
}

export function setFlexibleWindow(state: TripState, placeId: string, dayIds: string[]): TripState {
  return normalizeFlexibleWindows({ ...state, flexibleWindows: { ...state.flexibleWindows, [placeId]: dayIds } });
}

export function flexibleDaysFor(state: TripState, placeId: string): string[] {
  return normalizeFlexibleWindows(state).flexibleWindows?.[placeId] ?? [];
}

export function flexiblePlacesForDay(state: TripState, dayId: string): Place[] {
  const windows = normalizeFlexibleWindows(state).flexibleWindows ?? {};
  const placesById = new Map(state.places.map((place) => [place.id, place]));
  return state.unscheduledIds.flatMap((placeId) => {
    const place = placesById.get(placeId);
    return place && windows[placeId]?.includes(dayId) ? [place] : [];
  });
}

export function remainingWindowDays(state: TripState, placeId: string, fromDayId: string): string[] {
  const fromIndex = state.days.findIndex((day) => day.id === fromDayId);
  const dayIndex = new Map(state.days.map((day, index) => [day.id, index]));
  return flexibleDaysFor(state, placeId).filter((dayId) => dayIndex.get(dayId)! >= fromIndex);
}
