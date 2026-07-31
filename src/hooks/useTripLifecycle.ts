import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from '../context/AuthContext';
import type { TripActivityEvent, TripState } from '../types';
import { describeTripChanges } from '../domain/tripActivity';
import {
  acceptTripInvitations,
  createTripPlan,
  listTripPlans,
  loadPublicTrip,
  loadTripActivity,
  loadTripStateWithRevision,
  saveTripState,
  type TripPlanSummary,
} from '../lib/tripRepository';
import { createBlankTripState, createInitialState } from '../data/seed';
import { mergeTripStatesWithConflicts, type TripConflict, type TripConflictChoice } from '../domain/mergeTripState';
import { normalizeTripState, restoreTripState, type RestoredTrip } from '../domain/tripRestoration';

const LEGACY_STORAGE_KEY = 'taiwan-trip-planner:v1';
const DEMO_STORAGE_KEY = 'taiwan-trip-planner:demo:v1';
const SAVE_DEBOUNCE_MS = 700;
const REMOTE_REFRESH_MS = 4_000;

export type SyncStatus = 'loading' | 'saving' | 'saved' | 'error';

function restore(value: unknown): RestoredTrip {
  const result = restoreTripState(value);
  if (!result.ok) throw new Error(result.error);
  return result.trip;
}

function loadStoredState(key: string): RestoredTrip | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return null;
    return restore(JSON.parse(stored) as unknown);
  } catch (reason) {
    throw new Error(reason instanceof Error ? reason.message : 'The saved local trip could not be loaded.');
  }
}

function selectedPlanStorageKey(userId: string) {
  return `trip-planner:selected-plan:${userId}`;
}

interface LifecycleLoad {
  trip: RestoredTrip;
  planId: string | null;
  plans: TripPlanSummary[];
  revision: number;
}

function loadLocalAdapter(): LifecycleLoad {
  return {
    trip: loadStoredState(DEMO_STORAGE_KEY) ?? restore(createInitialState()),
    planId: null,
    plans: [],
    revision: 0,
  };
}

async function loadReadOnlyAdapter(shareToken: string): Promise<LifecycleLoad> {
  const state = await loadPublicTrip(shareToken);
  if (!state) throw new Error('This share link is invalid or no longer available.');
  return { trip: restore(state), planId: null, plans: [], revision: 0 };
}

async function loadCloudAdapter(accessToken: string, userId: string, requestedPlanId?: string): Promise<LifecycleLoad> {
  await acceptTripInvitations(accessToken);
  let plans = await listTripPlans(accessToken, userId);

  if (!plans.length) {
    const initial = loadStoredState(DEMO_STORAGE_KEY) ?? loadStoredState(LEGACY_STORAGE_KEY) ?? restore(createBlankTripState());
    if (initial.readOnly) return { trip: initial, planId: null, plans: [], revision: 0 };
    const createdPlanId = await createTripPlan(accessToken, userId, initial.state);
    plans = await listTripPlans(accessToken, userId);
    if (!plans.some((plan) => plan.id === createdPlanId)) {
      plans = [{ id: createdPlanId, ownerId: userId, tripName: initial.state.tripName, startDate: initial.state.startDate, updatedAt: new Date().toISOString(), isOwner: true }, ...plans];
    }
  }

  const storedPlanId = window.localStorage.getItem(selectedPlanStorageKey(userId));
  const selectedPlan =
    plans.find((plan) => plan.id === requestedPlanId) ??
    plans.find((plan) => plan.id === storedPlanId) ??
    plans[0];
  const loaded = await loadTripStateWithRevision(accessToken, selectedPlan.id);
  if (!loaded) throw new Error('The selected trip plan is no longer available.');

  window.localStorage.setItem(selectedPlanStorageKey(userId), selectedPlan.id);
  window.localStorage.removeItem(DEMO_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  return { trip: restore(loaded.state), planId: selectedPlan.id, plans, revision: loaded.revision };
}

interface UseTripLifecycleOptions {
  state: TripState;
  setState: Dispatch<SetStateAction<TripState>>;
  setForcedReadOnly: Dispatch<SetStateAction<boolean>>;
  shareToken?: string;
  requestedPlanId?: string;
}

interface PendingTripConflict {
  base: TripState;
  local: TripState;
  remote: TripState;
  revision: number;
  conflicts: TripConflict[];
}

export function useTripLifecycle({
  state,
  setState,
  setForcedReadOnly,
  shareToken,
  requestedPlanId,
}: UseTripLifecycleOptions) {
  const { accessToken, user, isDemo } = useAuth();
  const [planId, setPlanId] = useState<string | null>(null);
  const [plans, setPlans] = useState<TripPlanSummary[]>([]);
  const activePlan = useMemo(() => plans.find((plan) => plan.id === planId), [planId, plans]);
  const [isReady, setIsReady] = useState(false);
  const [loadBlocked, setLoadBlocked] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncConflicts, setSyncConflicts] = useState<TripConflict[]>([]);
  const saveSequence = useRef(0);
  const revision = useRef(0);
  const savedState = useRef<TripState | null>(null);
  const stateRef = useRef(state);
  const pendingConflict = useRef<PendingTripConflict | null>(null);
  const conflictChoices = useRef<Record<string, TripConflictChoice>>({});
  const canSave = useRef(!shareToken);
  const [activityEvents, setActivityEvents] = useState<TripActivityEvent[]>([]);
  stateRef.current = state;

  const retryLoad = useCallback(() => setLoadAttempt((attempt) => attempt + 1), []);
  const getSynchronizedState = useCallback(() => savedState.current, []);

  const applyRestoredTrip = useCallback((trip: RestoredTrip, readOnly = trip.readOnly) => {
    canSave.current = !readOnly;
    setForcedReadOnly(readOnly);
    savedState.current = trip.state;
    setState(trip.state);
    setSyncStatus(trip.error ? 'error' : 'saved');
    setSyncError(trip.error ?? null);
  }, [setForcedReadOnly, setState]);

  const refreshActivity = useCallback(async () => {
    if (isDemo || shareToken || !planId) {
      setActivityEvents([]);
      return;
    }
    setActivityEvents(await loadTripActivity(accessToken, planId));
  }, [accessToken, isDemo, planId, shareToken]);

  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);

  // Pull collaborator changes while this client has no unsaved edits.
  useEffect(() => {
    if (!isReady || isDemo || shareToken || !planId) return;
    let active = true;
    let refreshing = false;

    async function refreshState() {
      if (refreshing || stateRef.current !== savedState.current) return;
      refreshing = true;
      try {
        const latest = await loadTripStateWithRevision(accessToken, planId!);
        if (!active || !latest) return;
        if (latest.revision <= revision.current) {
          setSyncStatus('saved');
          setSyncError(null);
          return;
        }
        const restored = restore(latest.state);
        if (restored.readOnly) {
          applyRestoredTrip(restored, true);
          return;
        }
        revision.current = latest.revision;
        savedState.current = restored.state;
        setState(restored.state);
        setSyncStatus('saved');
        setSyncError(null);
      } catch (reason) {
        if (active) {
          setSyncStatus('error');
          setSyncError(reason instanceof Error ? reason.message : 'Unable to refresh collaborator changes.');
        }
      } finally {
        refreshing = false;
      }
    }

    const interval = window.setInterval(() => void refreshState(), REMOTE_REFRESH_MS);
    const onFocus = () => void refreshState();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [accessToken, applyRestoredTrip, isDemo, isReady, planId, setState, shareToken]);

  // Hydration effect
  useEffect(() => {
    let active = true;
    setIsReady(false);
    setLoadBlocked(false);
    setSyncStatus('loading');
    setSyncError(null);
    setPlanId(null);
    setPlans([]);
    setForcedReadOnly(Boolean(shareToken));
    canSave.current = !shareToken;
    pendingConflict.current = null;
    conflictChoices.current = {};
    setSyncConflicts([]);

    async function hydrate() {
      try {
        const loaded = shareToken
          ? await loadReadOnlyAdapter(shareToken)
          : isDemo
            ? loadLocalAdapter()
            : await loadCloudAdapter(accessToken, user.id, requestedPlanId);
        if (!active) return;
        setPlanId(loaded.planId);
        setPlans(loaded.plans);
        revision.current = loaded.revision;
        applyRestoredTrip(loaded.trip, Boolean(shareToken) || loaded.trip.readOnly);
      } catch (reason) {
        if (!active) return;
        setLoadBlocked(true);
        canSave.current = false;
        setForcedReadOnly(true);
        setSyncStatus('error');
        setSyncError(reason instanceof Error ? reason.message : 'Unable to load the saved trip.');
      } finally {
        if (active) setIsReady(true);
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, [accessToken, applyRestoredTrip, isDemo, loadAttempt, requestedPlanId, setForcedReadOnly, shareToken, user.id]);

  const beginConflictResolution = useCallback(async (local: TripState) => {
    if (!planId) return;
    const latest = await loadTripStateWithRevision(accessToken, planId);
    if (!latest) throw new Error('The selected trip plan is no longer available.');
    const restored = restore(latest.state);
    if (restored.readOnly) {
      applyRestoredTrip(restored, true);
      return;
    }

    const base = savedState.current ?? local;
    const merged = mergeTripStatesWithConflicts(base, local, restored.state);
    revision.current = latest.revision;
    savedState.current = restored.state;

    if (merged.conflicts.length) {
      pendingConflict.current = { base, local, remote: restored.state, revision: latest.revision, conflicts: merged.conflicts };
      conflictChoices.current = {};
      setSyncConflicts(merged.conflicts);
      setState(merged.state);
      setSyncStatus('error');
      setSyncError('Resolve collaborator conflicts before saving.');
      return;
    }

    setState(merged.state);
    setSyncStatus('saving');
    setSyncError(null);
  }, [accessToken, applyRestoredTrip, planId, setState]);

  const resolveConflict = useCallback((path: string, choice: TripConflictChoice) => {
    const pending = pendingConflict.current;
    if (!pending || !pending.conflicts.some((conflict) => conflict.path === path)) return;

    const choices = { ...conflictChoices.current, [path]: choice };
    conflictChoices.current = choices;
    setSyncConflicts((current) => current.filter((conflict) => conflict.path !== path));
    if (!pending.conflicts.every((conflict) => choices[conflict.path])) return;

    const resolved = mergeTripStatesWithConflicts(pending.base, pending.local, pending.remote, choices);
    const matchesRemote = JSON.stringify(resolved.state) === JSON.stringify(pending.remote);
    revision.current = pending.revision;
    savedState.current = pending.remote;
    pendingConflict.current = null;
    conflictChoices.current = {};
    setState(matchesRemote ? pending.remote : resolved.state);
    setSyncStatus(matchesRemote ? 'saved' : 'saving');
    setSyncError(null);
  }, [setState]);

  // Auto-save effect
  useEffect(() => {
    if (!isReady || !canSave.current || syncConflicts.length || (!isDemo && !planId)) return;
    if (!isDemo && state === savedState.current) return;

    const sequence = ++saveSequence.current;
    setSyncStatus('saving');
    setSyncError(null);

    const timeout = window.setTimeout(() => {
      if (isDemo) {
        window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(normalizeTripState(state)));
        savedState.current = state;
        if (saveSequence.current === sequence) setSyncStatus('saved');
        return;
      }

      const events = savedState.current ? describeTripChanges(savedState.current, state) : [];
      saveTripState(accessToken, planId!, state, revision.current, events)
        .then((nextRevision) => {
          revision.current = nextRevision;
          savedState.current = state;
          void refreshActivity();
          if (saveSequence.current === sequence) setSyncStatus('saved');
          setPlans((current) => current.map((plan) => plan.id === planId ? { ...plan, tripName: state.tripName, startDate: state.startDate, updatedAt: new Date().toISOString() } : plan));
        })
        .catch((reason: unknown) => {
          if (saveSequence.current !== sequence) return;
          if (reason instanceof Error && reason.message.includes('TRIP_CONFLICT')) {
            void beginConflictResolution(state).catch(() => {
              setSyncStatus('error');
              setSyncError('Another collaborator updated this trip. Your changes are still here; reload before trying again.');
            });
            return;
          }
          setSyncStatus('error');
          setSyncError(reason instanceof Error ? reason.message : 'Unable to save the trip.');
        });
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [accessToken, beginConflictResolution, isDemo, isReady, planId, refreshActivity, state, syncConflicts.length, user.id]);

  const syncNow = useCallback(async () => {
    if (isDemo || !canSave.current || !planId || syncConflicts.length) return;

    setSyncStatus('saving');
    setSyncError(null);
    try {
      const events = savedState.current ? describeTripChanges(savedState.current, state) : [];
      revision.current = await saveTripState(accessToken, planId, state, revision.current, events);
      savedState.current = state;
      await refreshActivity();
      setSyncStatus('saved');
      setPlans((current) => current.map((plan) => plan.id === planId ? { ...plan, tripName: state.tripName, startDate: state.startDate, updatedAt: new Date().toISOString() } : plan));
    } catch (reason) {
      if (reason instanceof Error && reason.message.includes('TRIP_CONFLICT')) {
        try {
          await beginConflictResolution(state);
          return;
        } catch {
          setSyncStatus('error');
          setSyncError('Another collaborator updated this trip. Your changes are still here; reload before trying again.');
          return;
        }
      }
      setSyncStatus('error');
      setSyncError(reason instanceof Error ? reason.message : 'Unable to save the trip.');
    }
  }, [accessToken, beginConflictResolution, isDemo, planId, refreshActivity, state, syncConflicts.length]);

  const persistForCloudSignIn = useCallback(() => {
    if (isDemo) window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(normalizeTripState(state)));
  }, [isDemo, state]);

  const switchPlan = useCallback(async (nextPlanId: string) => {
    if (isDemo || shareToken || nextPlanId === planId) return;

    setIsReady(false);
    setSyncStatus('loading');
    setSyncError(null);
    try {
      const next = await loadTripStateWithRevision(accessToken, nextPlanId);
      if (!next) throw new Error('The selected trip plan is no longer available.');
      const restored = restore(next.state);
      setPlanId(nextPlanId);
      revision.current = next.revision;
      applyRestoredTrip(restored);
      window.localStorage.setItem(selectedPlanStorageKey(user.id), nextPlanId);
    } catch (reason) {
      setSyncStatus('error');
      setSyncError(reason instanceof Error ? reason.message : 'Unable to load the selected trip.');
    } finally {
      setIsReady(true);
    }
  }, [accessToken, applyRestoredTrip, isDemo, planId, shareToken, user.id]);

  const createPlan = useCallback(async () => {
    if (isDemo || shareToken) return null;

    const nextState = normalizeTripState(createBlankTripState());
    setSyncStatus('saving');
    setSyncError(null);
    try {
      const nextPlanId = await createTripPlan(accessToken, user.id, nextState);
      let nextPlans = await listTripPlans(accessToken, user.id);
      if (!nextPlans.some((plan) => plan.id === nextPlanId)) {
        nextPlans = [{ id: nextPlanId, ownerId: user.id, tripName: nextState.tripName, startDate: nextState.startDate, updatedAt: new Date().toISOString(), isOwner: true }, ...nextPlans];
      }
      setPlans(nextPlans);
      setPlanId(nextPlanId);
      setState(nextState);
      setForcedReadOnly(false);
      canSave.current = true;
      revision.current = 0;
      savedState.current = nextState;
      window.localStorage.setItem(selectedPlanStorageKey(user.id), nextPlanId);
      setSyncStatus('saved');
      return nextPlanId;
    } catch (reason) {
      setSyncStatus('error');
      setSyncError(reason instanceof Error ? reason.message : 'Unable to create a trip plan.');
      return null;
    }
  }, [accessToken, isDemo, setForcedReadOnly, setState, shareToken, user.id]);

  return {
    planId,
    plans,
    activePlan,
    isReady,
    loadBlocked,
    retryLoad,
    syncStatus,
    syncError,
    syncConflicts,
    resolveConflict,
    getSynchronizedState,
    syncNow,
    persistForCloudSignIn,
    switchPlan,
    createPlan,
    activityEvents,
    refreshActivity,
  };
}
