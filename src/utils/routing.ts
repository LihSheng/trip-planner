import type { Place, RouteLegMode, TravelMode, TripDay } from '../types';

export function routeLegKey(fromPlaceId: string, toPlaceId: string) {
  return `${fromPlaceId}:${toPlaceId}`;
}

export function effectiveLegMode(day: TripDay, fromPlaceId: string, toPlaceId: string): TravelMode {
  const mode = day.legModeOverrides?.[routeLegKey(fromPlaceId, toPlaceId)];
  return mode && mode !== 'default' ? mode : day.travelMode ?? 'public';
}

export function markRouteStale(day: TripDay): TripDay {
  if (!day.routeLegs?.length && !day.routeUpdatedAt) return day;
  return { ...day, routeStale: true, routeError: undefined };
}

export function routePolylinePositions(day: TripDay, placesById: Map<string, Place>): [number, number][] {
  const positions: [number, number][] = [];
  for (const placeId of day.placeIds) {
    const place = placesById.get(placeId);
    if (place) positions.push([place.latitude, place.longitude]);
  }
  return positions;
}

export function isRouteCurrent(day: TripDay) {
  return Boolean(day.routeLegs?.length) && !day.routeStale;
}

export function modeLabel(mode: RouteLegMode) {
  return mode === 'default' ? 'Use day default' : mode;
}
