import type { DayExecutionState, Place, PlaceCategory, StopExecutionStatus, TravelMode, TripDay } from '../types';

/** Category → marker pin colour used by the map. */
export const markerColors: Record<PlaceCategory, string> = {
  Landmark: '#f08c46',
  Food: '#e85959',
  Nature: '#2f9e70',
  Culture: '#7950f2',
  Shopping: '#339af0',
  Relaxation: '#15aabf',
  Accommodation: '#5f3dc4',
};

/**
 * Build a Google Maps route URL for an ordered array of places.
 * Returns `null` when the array is empty.
 */
export function googleMapsRouteUrl(places: Place[]): string | null {
  if (!places.length) return null;
  if (places.length === 1) {
    const place = places[0];
    return `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
  }

  const origin = places[0];
  const destination = places[places.length - 1];
  const waypoints = places
    .slice(1, -1)
    .map((place) => `${place.latitude},${place.longitude}`)
    .join('|');
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: 'driving',
  });
  if (waypoints) params.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Google search URL for a place name + region. */
export function googleSearchUrl(place: Place): string {
  return `https://www.google.com/search?${new URLSearchParams({ q: `${place.name} ${place.region}` }).toString()}`;
}

/** Google Maps directions for one destination, optionally from live GPS coordinates. */
export function googleDirectionsUrl(
  place: Place,
  origin?: { latitude: number; longitude: number } | null,
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${place.latitude},${place.longitude}`,
  });
  if (origin) params.set('origin', `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Google Maps directions URL for a single leg between two places. */
export function legGoogleMapsUrl(from: Place, to: Place, mode: TravelMode): string {
  const travelmode =
    mode === 'public' ? 'transit'
    : mode === 'walk' ? 'walking'
    : mode === 'bike' ? 'bicycling'
    : mode === 'other' ? undefined
    : 'driving';
  const params = new URLSearchParams({
    api: '1',
    origin: `${from.latitude},${from.longitude}`,
    destination: `${to.latitude},${to.longitude}`,
  });
  if (travelmode) params.set('travelmode', travelmode);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Google Maps walking-navigation URL, optionally with a live-location origin. */
export function navigationUrl(
  place: Place,
  origin?: { latitude: number; longitude: number } | null,
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${place.latitude},${place.longitude}`,
    travelmode: 'walking',
  });
  if (origin) params.set('origin', `${origin.latitude},${origin.longitude}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Determine the execution status of a stop within a day. */
export function placeStatus(
  day: TripDay,
  execution: DayExecutionState | undefined,
  placeId: string,
): StopExecutionStatus {
  const stored = execution?.stopStates[placeId]?.status;
  if (stored) return stored;
  const firstEligible = day.placeIds.find(
    (id) =>
      !['completed', 'skipped', 'rescheduled'].includes(
        execution?.stopStates[id]?.status ?? 'upcoming',
      ),
  );
  return firstEligible === placeId ? 'current' : 'upcoming';
}

/** Format the scheduled time range for a stop (e.g. "09:00–10:30"). */
export function timeRange(day: TripDay, placeId: string): string {
  const schedule = day.stopSchedules?.[placeId];
  if (!schedule?.startTime) return 'No fixed time';
  if (!schedule.durationMinutes) return schedule.startTime;
  const [hour, minute] = schedule.startTime.split(':').map(Number);
  const end = new Date(2000, 0, 1, hour, minute + schedule.durationMinutes);
  return `${schedule.startTime}–${end.toTimeString().slice(0, 5)}`;
}
