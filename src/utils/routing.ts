import type { LocationCluster, Place, RouteLegMode, TravelMode, TripDay } from '../types';
import { clusterForPlace, clusterMember } from '../domain/locationCluster';
import { isPlaceholder } from '../domain/place';
import { estimateTravelMinutes } from './schedule';

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

export type LegRelationship = 'inside' | 'same-area' | 'walkable';

export interface ResolvedLeg {
  from: Place;
  to: Place;
  /** Raw override stored on the day, 'default' when none. */
  legMode: RouteLegMode;
  /** Mode actually used after cluster/override/day-default resolution. */
  mode: TravelMode;
  minutes?: number;
  relationship?: LegRelationship;
  inside: boolean;
}

/** Resolve the transport leg between two consecutive stops: mode, minutes and cluster relationship. */
export function resolveLeg(day: TripDay, clusters: LocationCluster[], from: Place, to: Place): ResolvedLeg {
  const dayDefaultMode: TravelMode = day.travelMode ?? 'public';
  const cluster = clusterForPlace(clusters, from.id);
  const nextCluster = clusterForPlace(clusters, to.id);
  const sameCluster = Boolean(cluster && nextCluster?.id === cluster.id);
  const connectionMember = cluster && sameCluster ? clusterMember(cluster, to.id) ?? clusterMember(cluster, from.id) : undefined;
  const relationship = (connectionMember?.relationship === 'nearby' ? 'walkable' : connectionMember?.relationship) as LegRelationship | undefined;
  const inside = relationship === 'inside';
  const legMode: RouteLegMode = day.legModeOverrides?.[routeLegKey(from.id, to.id)] ?? 'default';
  const mode: TravelMode = inside
    ? 'walk'
    : legMode !== 'default'
      ? legMode
      : relationship === 'same-area'
        ? connectionMember?.travelMode ?? dayDefaultMode
        : relationship === 'walkable'
          ? 'walk'
          : dayDefaultMode;
  const minutes = sameCluster
    ? connectionMember?.travelMinutes ?? connectionMember?.walkMinutes
    : !isPlaceholder(from) && !isPlaceholder(to) ? estimateTravelMinutes(from, to, mode) : undefined;
  return { from, to, legMode, mode, minutes, relationship, inside };
}

/** Consecutive legs for a day's placeIds, skipping ids with no place. */
export function dayLegs(day: TripDay, placesById: Map<string, Place>, clusters: LocationCluster[]): ResolvedLeg[] {
  const places = day.placeIds.map((id) => placesById.get(id)).filter((place): place is Place => Boolean(place));
  return places.slice(1).map((place, i) => resolveLeg(day, clusters, places[i], place));
}
