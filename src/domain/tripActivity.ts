import type { Place, TripActivityType, TripState } from '../types';
import { isPlaceholder } from './place';

export interface PendingTripActivity {
  type: TripActivityType;
  targetName: string;
  detail?: string;
}

function sourcePlaces(state: TripState) {
  return state.places.filter((place) => !place.assignmentOf && !isPlaceholder(place));
}

function dayName(state: TripState, dayId: string): string {
  return state.days.find((day) => day.id === dayId)?.label || 'a day';
}

function placeName(place: Place | undefined): string {
  return place?.name || 'a place';
}

/** Produces compact collaboration events from one saved-state transition. */
export function describeTripChanges(previous: TripState, next: TripState): PendingTripActivity[] {
  const events: PendingTripActivity[] = [];
  const beforePlaces = new Map(sourcePlaces(previous).map((place) => [place.id, place]));
  const afterPlaces = new Map(sourcePlaces(next).map((place) => [place.id, place]));

  afterPlaces.forEach((place, id) => {
    const before = beforePlaces.get(id);
    if (!before) {
      events.push({ type: 'place_added', targetName: place.name, detail: place.importedWithAi ? 'Imported with AI' : undefined });
    } else if (JSON.stringify(before) !== JSON.stringify(place)) {
      events.push({ type: 'place_updated', targetName: place.name });
    }
  });
  beforePlaces.forEach((place, id) => {
    if (!afterPlaces.has(id)) events.push({ type: 'place_removed', targetName: place.name });
  });

  const beforeDays = new Map(previous.days.map((day) => [day.id, day]));
  const afterDays = new Map(next.days.map((day) => [day.id, day]));
  afterDays.forEach((day, id) => {
    const before = beforeDays.get(id);
    if (!before) {
      events.push({ type: 'day_added', targetName: day.label || 'New day' });
      return;
    }
    if (before.label !== day.label || JSON.stringify(before.stopSchedules) !== JSON.stringify(day.stopSchedules) || before.travelMode !== day.travelMode || before.startTime !== day.startTime) {
      events.push({ type: 'day_updated', targetName: day.label || 'Day' });
    }
    if (JSON.stringify(before.placeIds) !== JSON.stringify(day.placeIds)) {
      const changedId = day.placeIds.find((placeId, index) => before.placeIds[index] !== placeId) ?? before.placeIds.find((placeId, index) => day.placeIds[index] !== placeId);
      events.push({ type: 'place_moved', targetName: placeName(afterPlaces.get(changedId ?? '') ?? beforePlaces.get(changedId ?? '')), detail: `in ${dayName(next, id)}` });
    }
  });
  beforeDays.forEach((day, id) => {
    if (!afterDays.has(id)) events.push({ type: 'day_removed', targetName: day.label || 'Day' });
  });

  return events.slice(0, 20);
}
