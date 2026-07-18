import type { ContainerId, TripState } from '../types';

export function findContainer(state: TripState, placeId: string): ContainerId | null {
  if (state.unscheduledIds.includes(placeId)) return 'unscheduled';
  return state.days.find((day) => day.placeIds.includes(placeId))?.id ?? null;
}

export function getContainerItems(state: TripState, containerId: ContainerId): string[] {
  if (containerId === 'unscheduled') return state.unscheduledIds;
  return state.days.find((day) => day.id === containerId)?.placeIds ?? [];
}

export function replaceContainerItems(
  state: TripState,
  containerId: ContainerId,
  items: string[],
): TripState {
  if (containerId === 'unscheduled') return { ...state, unscheduledIds: items };
  return {
    ...state,
    days: state.days.map((day) => (day.id === containerId ? { ...day, placeIds: items } : day)),
  };
}

export function movePlace(
  state: TripState,
  placeId: string,
  destinationId: ContainerId,
  destinationIndex: number,
): TripState {
  const sourceId = findContainer(state, placeId);
  if (!sourceId) return state;

  const sourceItems = getContainerItems(state, sourceId);
  const destinationItems = getContainerItems(state, destinationId);
  const sourceIndex = sourceItems.indexOf(placeId);

  if (sourceId === destinationId) {
    if (sourceIndex === destinationIndex) return state;
    const next = [...sourceItems];
    next.splice(sourceIndex, 1);
    next.splice(Math.max(0, Math.min(destinationIndex, next.length)), 0, placeId);
    return replaceContainerItems(state, sourceId, next);
  }

  let next = replaceContainerItems(
    state,
    sourceId,
    sourceItems.filter((id) => id !== placeId),
  );
  const target = [...destinationItems];
  target.splice(Math.max(0, Math.min(destinationIndex, target.length)), 0, placeId);
  next = replaceContainerItems(next, destinationId, target);
  return next;
}
