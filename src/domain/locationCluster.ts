import type { ClusterRelationship, LocationCluster, Place, TripState } from '../types';

export interface ClusterAssignment {
  targetPlaceId: string;
  relationship: ClusterRelationship;
  walkMinutes?: number;
}

export function clusterPlaceIds(cluster: LocationCluster): string[] {
  return [cluster.anchorPlaceId, ...cluster.members.map((member) => member.placeId)];
}

export function clusterForPlace(clusters: LocationCluster[] | undefined, placeId: string) {
  return clusters?.find((cluster) => cluster.anchorPlaceId === placeId || cluster.members.some((member) => member.placeId === placeId));
}

export function clusterMember(cluster: LocationCluster, placeId: string) {
  return cluster.members.find((member) => member.placeId === placeId);
}

export function normalizeLocationClusters(state: TripState): LocationCluster[] {
  const placeIds = new Set(state.places.filter((place) => !place.assignmentOf && !place.placeholderKind).map((place) => place.id));
  const claimed = new Set<string>();
  const normalized: LocationCluster[] = [];

  for (const cluster of state.locationClusters ?? []) {
    if (!placeIds.has(cluster.anchorPlaceId) || claimed.has(cluster.anchorPlaceId)) continue;
    claimed.add(cluster.anchorPlaceId);
    const members = cluster.members.filter((member) => {
      if (!placeIds.has(member.placeId) || member.placeId === cluster.anchorPlaceId || claimed.has(member.placeId)) return false;
      claimed.add(member.placeId);
      return member.relationship === 'inside' || member.relationship === 'nearby';
    });
    if (members.length) normalized.push({ ...cluster, name: cluster.name.trim() || 'Location cluster', members });
  }
  return normalized;
}

export function assignPlaceToCluster(state: TripState, placeId: string, assignment?: ClusterAssignment): TripState {
  const clusters = normalizeLocationClusters(state);
  const source = clusterForPlace(clusters, placeId);
  if (source?.anchorPlaceId === placeId) return state;

  const withoutPlace = clusters
    .map((cluster) => ({ ...cluster, members: cluster.members.filter((member) => member.placeId !== placeId) }))
    .filter((cluster) => cluster.members.length);
  if (!assignment) return { ...state, locationClusters: withoutPlace };

  const targetCluster = clusterForPlace(withoutPlace, assignment.targetPlaceId);
  const targetPlace = state.places.find((place) => place.id === (targetCluster?.anchorPlaceId ?? assignment.targetPlaceId));
  if (!targetPlace || targetPlace.id === placeId) return { ...state, locationClusters: withoutPlace };
  const member = {
    placeId,
    relationship: assignment.relationship,
    walkMinutes: assignment.relationship === 'nearby' ? assignment.walkMinutes : undefined,
  };

  if (targetCluster) {
    return {
      ...state,
      locationClusters: withoutPlace.map((cluster) => cluster.id === targetCluster.id
        ? { ...cluster, members: [...cluster.members, member] }
        : cluster),
    };
  }

  return {
    ...state,
    locationClusters: [
      ...withoutPlace,
      {
        id: `cluster-${crypto.randomUUID()}`,
        name: `${targetPlace.name} area`,
        anchorPlaceId: targetPlace.id,
        members: [member],
      },
    ],
  };
}

export function removePlacesFromClusters(state: TripState, removedIds: Set<string>): LocationCluster[] {
  return normalizeLocationClusters(state)
    .filter((cluster) => !removedIds.has(cluster.anchorPlaceId))
    .map((cluster) => ({ ...cluster, members: cluster.members.filter((member) => !removedIds.has(member.placeId)) }))
    .filter((cluster) => cluster.members.length);
}

export function distanceMeters(left: Pick<Place, 'latitude' | 'longitude'>, right: Pick<Place, 'latitude' | 'longitude'>) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimatedWalkMinutes(distance: number) {
  return Math.max(1, Math.round(distance / 80));
}
