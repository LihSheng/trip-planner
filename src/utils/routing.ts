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

export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0; let latitude = 0; let longitude = 0;
  while (index < encoded.length) {
    let shift = 0; let value = 0; let byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; value |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20 && index < encoded.length);
    latitude += (value & 1) ? ~(value >> 1) : value >> 1;
    shift = 0; value = 0;
    do { byte = encoded.charCodeAt(index++) - 63; value |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20 && index < encoded.length);
    longitude += (value & 1) ? ~(value >> 1) : value >> 1;
    points.push([latitude / 1e5, longitude / 1e5]);
  }
  return points;
}

export function isRouteCurrent(day: TripDay) {
  return Boolean(day.routeLegs?.length) && !day.routeStale;
}

export function modeLabel(mode: RouteLegMode) {
  return mode === 'default' ? 'Use day default' : mode;
}
