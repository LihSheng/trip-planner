import type { LocationCluster, Place, RouteLegMode, TravelMode, TripDay } from '../types';
import { clusterForPlace, clusterMember, distanceMeters } from '../domain/locationCluster';
import { isPlaceholder } from '../domain/place';
import { isTransitEligible, legTransit, routeLegKey, type LegTransit } from '../domain/transit';
import { plannedLeaveMinutes } from './schedule';

const TRAVEL_SPEEDS_KMH: Record<TravelMode, number> = {
  public: 24,
  walk: 4.5,
  bike: 14,
  car: 45,
  taxi: 42,
  other: 20,
};

/** Straight-line fallback. Private so that resolveLeg stays the only source of leg minutes. */
function estimateTravelMinutes(from: Place, to: Place, mode: TravelMode) {
  const roadFactor = mode === 'walk' ? 1.15 : 1.3;
  return Math.max(5, Math.round((distanceMeters(from, to) / 1000 * roadFactor / TRAVEL_SPEEDS_KMH[mode]) * 60));
}

export function routePolylinePositions(day: TripDay, placesById: Map<string, Place>): [number, number][] {
  const positions: [number, number][] = [];
  for (const placeId of day.placeIds) {
    const place = placesById.get(placeId);
    if (place) positions.push([place.latitude, place.longitude]);
  }
  return positions;
}

export function modeLabel(mode: RouteLegMode) {
  return mode === 'default' ? 'Use day default' : mode;
}

export function isExceptionLeg(legMode: RouteLegMode, resolvedMode: TravelMode, dayDefaultMode: TravelMode): boolean {
  return legMode !== 'default';
}

export type LegRelationship = 'inside' | 'same-area' | 'walkable';

export type LegMinutesSource = 'transit' | 'cluster' | 'estimate' | 'none';

export interface ResolvedLeg {
  from: Place;
  to: Place;
  key: string;
  /** Raw override stored on the day, 'default' when none. */
  legMode: RouteLegMode;
  /** Mode actually used after cluster/override/day-default resolution. */
  mode: TravelMode;
  /** The leg's minutes for every surface: chosen transit route, then cluster member, then estimate; undefined for placeholders. */
  minutes?: number;
  minutesSource: LegMinutesSource;
  relationship?: LegRelationship;
  inside: boolean;
  transit: LegTransit;
}

/**
 * Resolve the transport leg between two consecutive stops: mode, minutes and cluster relationship.
 * Nothing else may estimate leg time, so every surface shows the same minutes.
 */
export function resolveLeg(day: TripDay, clusters: LocationCluster[], from: Place, to: Place): ResolvedLeg {
  const key = routeLegKey(from.id, to.id);
  const dayDefaultMode: TravelMode = day.travelMode ?? 'public';
  const cluster = clusterForPlace(clusters, from.id);
  const nextCluster = clusterForPlace(clusters, to.id);
  const sameCluster = Boolean(cluster && nextCluster?.id === cluster.id);
  const connectionMember = cluster && sameCluster ? clusterMember(cluster, to.id) ?? clusterMember(cluster, from.id) : undefined;
  const relationship = (connectionMember?.relationship === 'nearby' ? 'walkable' : connectionMember?.relationship) as LegRelationship | undefined;
  const inside = relationship === 'inside';
  const legMode: RouteLegMode = day.legModeOverrides?.[key] ?? 'default';
  const mode: TravelMode = inside
    ? 'walk'
    : legMode !== 'default'
      ? legMode
      : relationship === 'same-area'
        ? connectionMember?.travelMode ?? dayDefaultMode
        : relationship === 'walkable'
          ? 'walk'
          : dayDefaultMode;
  const transit = legTransit(
    day.transitByLeg?.[key],
    isTransitEligible(mode, inside, from, to),
    from,
    to,
    day.timeManagementEnabled ? plannedLeaveMinutes(day, from) : null,
  );
  // A stale chosen route still wins: the traveller picked it, and the UI flags it for refresh.
  const chosen = transit.status === 'saved' ? transit.chosen : null;
  const [minutes, minutesSource]: [number | undefined, LegMinutesSource] = chosen
    ? [chosen.minutes, 'transit']
    : sameCluster
      ? [connectionMember?.travelMinutes ?? connectionMember?.walkMinutes, 'cluster']
      : !isPlaceholder(from) && !isPlaceholder(to)
        ? [estimateTravelMinutes(from, to, mode), 'estimate']
        : [undefined, 'none'];
  return {
    from, to, key, legMode, mode, minutes,
    minutesSource: minutes === undefined ? 'none' : minutesSource,
    relationship, inside, transit,
  };
}

/** A day's stops in order, skipping ids with no place. dayLegs(...)[i] runs from dayStops(...)[i] to dayStops(...)[i + 1]. */
export function dayStops(day: TripDay, placesById: Map<string, Place>): Place[] {
  return day.placeIds.flatMap((id) => { const place = placesById.get(id); return place ? [place] : []; });
}

/** Consecutive legs for a day's placeIds, skipping ids with no place. */
export function dayLegs(day: TripDay, placesById: Map<string, Place>, clusters: LocationCluster[]): ResolvedLeg[] {
  const places = dayStops(day, placesById);
  return places.slice(1).map((place, i) => resolveLeg(day, clusters, places[i], place));
}

/** Total minutes over legs; a leg with unknown minutes (placeholder, cluster without a time) adds 0. */
export function sumLegMinutes(legs: ResolvedLeg[]): number {
  return legs.reduce((total, leg) => total + (leg.minutes ?? 0), 0);
}

/**
 * A day's travel minutes, the one number every day summary shows.
 * `placesById` must hold every place the day lists, placeholders and hotel-stay copies included,
 * so the total is the sum of the legs the planner shows rather than a route that skips stops.
 */
export function dayTravelMinutes(day: TripDay, placesById: Map<string, Place>, clusters: LocationCluster[]): number {
  return sumLegMinutes(dayLegs(day, placesById, clusters));
}

/** A leg the map can draw: a placeholder has no real coordinates (0,0), so a leg touching one gets no line or chip. */
export function isDrawableLeg(leg: Pick<ResolvedLeg, 'from' | 'to'>): boolean {
  return !isPlaceholder(leg.from) && !isPlaceholder(leg.to);
}
