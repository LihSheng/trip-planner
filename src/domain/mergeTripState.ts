import type { TripState } from '../types';

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIdRecord(value: unknown): value is Record<string, unknown> & { id: string } {
  return isRecord(value) && typeof value.id === 'string';
}

function mergeStringArray(base: string[], local: string[], remote: string[]) {
  const localSet = new Set(local);
  const baseSet = new Set(base);
  const locallyRemoved = new Set(base.filter((value) => !localSet.has(value)));
  const result = remote.filter((value) => !locallyRemoved.has(value));

  for (const value of local) {
    if (!baseSet.has(value) && !result.includes(value)) result.push(value);
  }

  const localReorderedBaseItems = local.filter((value) => baseSet.has(value));
  const remainingBaseItems = base.filter((value) => localSet.has(value));
  if (!equal(localReorderedBaseItems, remainingBaseItems)) {
    const remoteOnly = result.filter((value) => !localSet.has(value));
    return [...local.filter((value) => result.includes(value)), ...remoteOnly];
  }
  return result;
}

function mergeIdArray(
  base: Array<Record<string, unknown> & { id: string }>,
  local: Array<Record<string, unknown> & { id: string }>,
  remote: Array<Record<string, unknown> & { id: string }>,
) {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const locallyRemoved = new Set(base.filter((item) => !localById.has(item.id)).map((item) => item.id));
  const result: Array<Record<string, unknown> & { id: string }> = [];

  for (const remoteItem of remote) {
    if (locallyRemoved.has(remoteItem.id)) continue;
    const localItem = localById.get(remoteItem.id);
    const baseItem = baseById.get(remoteItem.id);
    result.push(localItem && baseItem
      ? mergeValue(baseItem, localItem, remoteItem) as Record<string, unknown> & { id: string }
      : remoteItem);
  }

  for (const localItem of local) {
    if (remoteById.has(localItem.id)) continue;
    const baseItem = baseById.get(localItem.id);
    if (!baseItem || !equal(localItem, baseItem)) result.push(localItem);
  }
  return result;
}

function mergeValue(base: unknown, local: unknown, remote: unknown): unknown {
  if (equal(local, base)) return remote;
  if (equal(remote, base) || equal(local, remote)) return local;
  if (local === undefined || remote === undefined) return local;

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    if ([...base, ...local, ...remote].every((value) => typeof value === 'string')) {
      return mergeStringArray(base as string[], local as string[], remote as string[]);
    }
    if ([...base, ...local, ...remote].every(isIdRecord)) {
      return mergeIdArray(base, local, remote);
    }
    return local;
  }

  if (isRecord(base) && isRecord(local) && isRecord(remote)) {
    const result: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = mergeValue(base[key], local[key], remote[key]);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  // Both collaborators changed the same scalar. Keep the local edit.
  return local;
}

/** Rebase unsaved local edits onto a newer collaborator revision. */
export function mergeTripStates(base: TripState, local: TripState, remote: TripState): TripState {
  return mergeValue(base, local, remote) as TripState;
}
