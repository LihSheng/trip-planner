import type { Place, TripDay, TripState } from '../types';
import type { AiResolvedPlace, ConfirmedAiDraft } from '../types/aiImport';
import { markRouteStale } from './routing';

function importedPlace(candidate: AiResolvedPlace): Place | null {
  if (candidate.resolution !== 'resolved' || candidate.latitude === undefined || candidate.longitude === undefined) return null;
  return {
    id: `place-${crypto.randomUUID()}`,
    name: candidate.name,
    region: candidate.region,
    category: candidate.category,
    type: candidate.type,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    notes: candidate.notes,
  };
}

/** Converts reviewed candidates only. It never removes existing trip state. */
export function applyAiDraft(state: TripState, confirmed: ConfirmedAiDraft): TripState {
  const newPlaces: Place[] = [];
  const usedCandidateIds = new Set<string>();
  const candidatePlaceId = new Map<string, string>();

  const resolveCandidate = (candidate: AiResolvedPlace) => {
    if (!candidate.included || usedCandidateIds.has(candidate.tempId)) return undefined;
    usedCandidateIds.add(candidate.tempId);
    if (candidate.resolution === 'existing-place' && candidate.existingPlaceId && state.places.some((place) => place.id === candidate.existingPlaceId)) {
      candidatePlaceId.set(candidate.tempId, candidate.existingPlaceId);
      return candidate.existingPlaceId;
    }
    const place = importedPlace(candidate);
    if (!place) return undefined;
    newPlaces.push(place);
    candidatePlaceId.set(candidate.tempId, place.id);
    return place.id;
  };

  const unscheduled = [...state.unscheduledIds];
  const addUnscheduled = (candidate: AiResolvedPlace) => {
    const placeId = resolveCandidate(candidate);
    if (placeId && !unscheduled.includes(placeId)) unscheduled.push(placeId);
  };

  if (confirmed.preferences.mergeMode === 'unscheduled') {
    confirmed.draft.days.flatMap((day) => day.places).forEach(addUnscheduled);
  }
  confirmed.draft.unscheduled.forEach(addUnscheduled);

  const days: TripDay[] = confirmed.preferences.mergeMode === 'new-days'
    ? [
      ...state.days,
      ...confirmed.draft.days.map((draftDay) => {
        const stopSchedules: NonNullable<TripDay['stopSchedules']> = {};
        const placeIds = draftDay.places.flatMap((candidate) => {
          const placeId = resolveCandidate(candidate);
          if (!placeId) return [];
          if (candidate.suggestedStartTime || candidate.durationMinutes) {
            stopSchedules[placeId] = { startTime: candidate.suggestedStartTime, durationMinutes: candidate.durationMinutes };
          }
          return [placeId];
        });
        return markRouteStale({
          id: `day-${crypto.randomUUID()}`,
          label: draftDay.label || `Day ${state.days.length + 1}`,
          placeIds,
          travelMode: confirmed.preferences.travelMode ?? 'public',
          stopSchedules,
          timeManagementEnabled: placeIds.some((id) => Boolean(stopSchedules[id]?.startTime)),
        });
      }),
    ]
    : state.days;

  const scheduledIds = new Set(days.flatMap((day) => day.placeIds));
  return { ...state, places: [...state.places, ...newPlaces], days, unscheduledIds: unscheduled.filter((id) => !scheduledIds.has(id)) };
}
