import type { ItineraryEntry, TripState } from '../types';

function entryId(containerId: string, index: number, placeId: string) {
  return `entry:${containerId}:${index}:${placeId}`;
}

/**
 * Creates stable visit records from legacy containers. The stable IDs make this
 * migration idempotent and preserve repeated accommodation visits.
 */
export function ensureItineraryEntries(state: TripState): TripState {
  if (state.itineraryEntries) return state;

  const placeIds = new Set(state.places.map((place) => place.id));
  const entries: ItineraryEntry[] = [];
  const add = (containerId: string, placeId: string, sortOrder: number, dayId?: string) => {
    if (!placeIds.has(placeId)) throw new Error(`Itinerary references missing place ${placeId}.`);
    entries.push({ id: entryId(containerId, sortOrder, placeId), placeId, dayId, sortOrder });
  };

  state.unscheduledIds.forEach((placeId, index) => add('unscheduled', placeId, index));
  state.days.forEach((day) => day.placeIds.forEach((placeId, index) => add(day.id, placeId, index, day.id)));
  return { ...state, itineraryEntries: entries };
}
