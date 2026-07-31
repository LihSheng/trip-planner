import type { TripState } from '../types';

export type TripConflictChoice = 'local' | 'remote';

export interface TripConflict {
  path: string;
  localValue: unknown;
  remoteValue: unknown;
}

export interface TripMergeResult {
  state: TripState;
  conflicts: TripConflict[];
}

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

function conflictPath(path: string[]) {
  return path.join('.');
}

function chooseConflict(
  path: string[],
  local: unknown,
  remote: unknown,
  conflicts: TripConflict[],
  resolutions: Readonly<Record<string, TripConflictChoice>>,
) {
  const key = conflictPath(path);
  conflicts.push({ path: key, localValue: local, remoteValue: remote });
  return resolutions[key] === 'remote' ? remote : local;
}

function mergeStringArray(
  base: string[],
  local: string[],
  remote: string[],
  path: string[],
  conflicts: TripConflict[],
  resolutions: Readonly<Record<string, TripConflictChoice>>,
) {
  const localSet = new Set(local);
  const baseSet = new Set(base);
  const locallyRemoved = new Set(base.filter((value) => !localSet.has(value)));
  const result = remote.filter((value) => !locallyRemoved.has(value));

  for (const value of local) {
    if (!baseSet.has(value) && !result.includes(value)) result.push(value);
  }

  const localReorderedBaseItems = local.filter((value) => baseSet.has(value));
  const remainingBaseItems = base.filter((value) => localSet.has(value));
  const remoteSet = new Set(remote);
  const remoteReorderedBaseItems = remote.filter((value) => baseSet.has(value));
  const remoteRemainingBaseItems = base.filter((value) => remoteSet.has(value));
  const localReordered = !equal(localReorderedBaseItems, remainingBaseItems);
  const remoteReordered = !equal(remoteReorderedBaseItems, remoteRemainingBaseItems);
  if (localReordered && remoteReordered && !equal(localReorderedBaseItems, remoteReorderedBaseItems)) {
    return chooseConflict(path, local, remote, conflicts, resolutions) as string[];
  }
  if (localReordered) {
    const remoteOnly = result.filter((value) => !localSet.has(value));
    return [...local.filter((value) => result.includes(value)), ...remoteOnly];
  }
  return result;
}

function mergeKeyedArray(
  base: Array<Record<string, unknown>>,
  local: Array<Record<string, unknown>>,
  remote: Array<Record<string, unknown>>,
  path: string[],
  conflicts: TripConflict[],
  resolutions: Readonly<Record<string, TripConflictChoice>>,
) {
  const baseById = new Map(base.map((item) => [recordKey(item)!, item]));
  const localById = new Map(local.map((item) => [recordKey(item)!, item]));
  const remoteById = new Map(remote.map((item) => [recordKey(item)!, item]));
  const result: Array<Record<string, unknown>> = [];
  const keys = [...new Set([...remoteById.keys(), ...localById.keys(), ...baseById.keys()])];

  for (const key of keys) {
    const itemPath = [...path, key];
    const remoteItem = remoteById.get(key);
    const localItem = localById.get(key);
    const baseItem = baseById.get(key);
    let merged: unknown;

    if (baseItem && !localItem && remoteItem) {
      merged = equal(remoteItem, baseItem)
        ? undefined
        : chooseConflict(itemPath, undefined, remoteItem, conflicts, resolutions);
    } else if (baseItem && localItem && !remoteItem) {
      merged = equal(localItem, baseItem)
        ? undefined
        : chooseConflict(itemPath, localItem, undefined, conflicts, resolutions);
    } else if (!baseItem && localItem && remoteItem) {
      merged = equal(localItem, remoteItem)
        ? localItem
        : chooseConflict(itemPath, localItem, remoteItem, conflicts, resolutions);
    } else if (baseItem && localItem && remoteItem) {
      merged = mergeValue(baseItem, localItem, remoteItem, itemPath, conflicts, resolutions);
    } else {
      merged = localItem ?? remoteItem;
    }

    if (isRecord(merged)) result.push(merged);
  }
  return result;
}

function mergeValue(
  base: unknown,
  local: unknown,
  remote: unknown,
  path: string[],
  conflicts: TripConflict[],
  resolutions: Readonly<Record<string, TripConflictChoice>>,
): unknown {
  if (equal(local, base)) return remote;
  if (equal(remote, base) || equal(local, remote)) return local;
  if (local === undefined || remote === undefined) {
    return chooseConflict(path, local, remote, conflicts, resolutions);
  }

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    if ([...base, ...local, ...remote].every((value) => typeof value === 'string')) {
      return mergeStringArray(base as string[], local as string[], remote as string[], path, conflicts, resolutions);
    }
    if ([...base, ...local, ...remote].every((value) => recordKey(value) !== undefined)) {
      return mergeKeyedArray(base, local, remote, path, conflicts, resolutions);
    }
    return chooseConflict(path, local, remote, conflicts, resolutions);
  }

  if (isRecord(base) && isRecord(local) && isRecord(remote)) {
    const result: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = mergeValue(base[key], local[key], remote[key], [...path, key], conflicts, resolutions);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  return chooseConflict(path, local, remote, conflicts, resolutions);
}

/** Rebase unsaved local edits onto a newer collaborator revision. */
export function mergeTripStates(base: TripState, local: TripState, remote: TripState): TripState {
  return mergeTripStatesWithConflicts(base, local, remote).state;
}

export function mergeTripStatesWithConflicts(
  base: TripState,
  local: TripState,
  remote: TripState,
  resolutions: Readonly<Record<string, TripConflictChoice>> = {},
): TripMergeResult {
  const conflicts: TripConflict[] = [];
  const state = mergeValue(base, local, remote, [], conflicts, resolutions) as TripState;
  return { state, conflicts };
}
