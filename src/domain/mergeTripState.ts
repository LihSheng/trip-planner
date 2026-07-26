import type { TripState } from '../types';

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordKey(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.id === 'string') return value.id;
  if (typeof value.placeId === 'string') return value.placeId;
  return undefined;
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

function mergeKeyedArray(
  base: Array<Record<string, unknown>>,
  local: Array<Record<string, unknown>>,
  remote: Array<Record<string, unknown>>,
) {
  const baseById = new Map(base.map((item) => [recordKey(item)!, item]));
  const localById = new Map(local.map((item) => [recordKey(item)!, item]));
  const remoteById = new Map(remote.map((item) => [recordKey(item)!, item]));
  const locallyRemoved = new Set(base.filter((item) => !localById.has(recordKey(item)!)).map((item) => recordKey(item)!));
  const result: Array<Record<string, unknown>> = [];

  for (const remoteItem of remote) {
    const key = recordKey(remoteItem)!;
    if (locallyRemoved.has(key)) continue;
    const localItem = localById.get(key);
    const baseItem = baseById.get(key);
    result.push(localItem && baseItem
      ? mergeValue(baseItem, localItem, remoteItem) as Record<string, unknown>
      : remoteItem);
  }

  for (const localItem of local) {
    const key = recordKey(localItem)!;
    if (remoteById.has(key)) continue;
    const baseItem = baseById.get(key);
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
    if ([...base, ...local, ...remote].every((value) => recordKey(value) !== undefined)) {
      return mergeKeyedArray(base, local, remote);
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
