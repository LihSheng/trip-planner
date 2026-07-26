import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from '../context/AuthContext';
import type { TripActivityEvent, TripState } from '../types';
import { describeTripChanges } from '../domain/tripActivity';
import {
  acceptTripInvitations,
  createTripPlan,
  isTripState,
  listTripPlans,
  loadPublicTrip,
  loadTripActivity,
  loadTripStateWithRevision,
  normalizeTripState,
  saveTripState,
  type TripPlanSummary,
} from '../lib/tripRepository';
import { createBlankTripState, createInitialState } from '../data/seed';
import { ensureActivities } from '../domain/activity';
import { ensureItineraryEntries } from '../domain/itinerary';

const LEGACY_STORAGE_KEY = 'taiwan-trip-planner:v1';
const DEMO_STORAGE_KEY = 'taiwan-trip-planner:demo:v1';
const SAVE_DEBOUNCE_MS = 700;

export type SyncStatus = 'loading' | 'saving' | 'saved' | 'error';

function loadStoredState(key: string): TripState | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as unknown;
    return isTripState(parsed) ? normalizeTripState(parsed) : null;
  } catch {
    return null;
  }
}

function selectedPlanStorageKey(userId: string) {
  return `trip-planner:selected-plan:${userId}`;
}

interface UseTripPersistenceOptions {
  state: TripState;
  setState: Dispatch<SetStateAction<TripState>>;
  planId: string | null;
  setPlanId: Dispatch<SetStateAction<string | null>>;
  setPlans: Dispatch<SetStateAction<TripPlanSummary[]>>;
  shareToken?: string;
  requestedPlanId?: string;
}

export function useTripPersistence({
  state,
  setState,
  planId,
  setPlanId,
  setPlans,
  shareToken,
  requestedPlanId,
}: UseTripPersistenceOptions) {
  const { accessToken, user, isDemo } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const [syncError, setSyncError] = useState<string | null>(null);
  const saveSequence = useRef(0);
  const revision = useRef(0);
  const savedState = useRef<TripState | null>(null);
  const [activityEvents, setActivityEvents] = useState<TripActivityEvent[]>([]);

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

  // Hydration effect
  useEffect(() => {
    let active = true;
    setIsReady(false);
    setSyncStatus('loading');
    setSyncError(null);
    setPlanId(null);

    async function hydrate() {
      try {
        if (shareToken) {
          const sharedState = await loadPublicTrip(shareToken);
          if (!sharedState) throw new Error('This share link is invalid or no longer available.');
          const normalized = ensureActivities(sharedState);
          savedState.current = normalized;
          setState(normalized);
          setSyncStatus('saved');
          return;
        }

        if (isDemo) {
          const nextState = loadStoredState(DEMO_STORAGE_KEY) ?? ensureActivities(ensureItineraryEntries(createInitialState()));
          savedState.current = nextState;
          setState(nextState);
          setPlans([]);
          setSyncStatus('saved');
          return;
        }

        await acceptTripInvitations(accessToken);
        let remotePlans = await listTripPlans(accessToken, user.id);
        if (!active) return;

        if (!remotePlans.length) {
          const initialState = loadStoredState(DEMO_STORAGE_KEY) ?? loadStoredState(LEGACY_STORAGE_KEY) ?? ensureActivities(ensureItineraryEntries(createBlankTripState()));
          const createdPlanId = await createTripPlan(accessToken, user.id, initialState);
          if (!active) return;
          remotePlans = await listTripPlans(accessToken, user.id);
          if (!remotePlans.some((plan) => plan.id === createdPlanId)) {
            remotePlans = [{ id: createdPlanId, ownerId: user.id, tripName: initialState.tripName, startDate: initialState.startDate, updatedAt: new Date().toISOString(), isOwner: true }, ...remotePlans];
          }
        }

        const storedPlanId = window.localStorage.getItem(selectedPlanStorageKey(user.id));
        const selectedPlan =
          remotePlans.find((plan) => plan.id === requestedPlanId) ??
          remotePlans.find((plan) => plan.id === storedPlanId) ??
          remotePlans[0];
        const remote = await loadTripStateWithRevision(accessToken, selectedPlan.id);
        if (!active) return;
        if (!remote) throw new Error('The selected trip plan is no longer available.');

        setPlanId(selectedPlan.id);
        setPlans(remotePlans);
        revision.current = remote.revision;
        savedState.current = ensureActivities(remote.state);
        setState(savedState.current);
        window.localStorage.setItem(selectedPlanStorageKey(user.id), selectedPlan.id);
        window.localStorage.removeItem(DEMO_STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        if (active) setSyncStatus('saved');
      } catch (reason) {
        if (!active) return;
        setState(loadStoredState(LEGACY_STORAGE_KEY) ?? ensureActivities(ensureItineraryEntries(createInitialState())));
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
  }, [accessToken, isDemo, requestedPlanId, setPlanId, setPlans, setState, shareToken, user.id]);

  // Auto-save effect
  useEffect(() => {
    if (!isReady || shareToken || (!isDemo && !planId)) return;
    if (!isDemo && state === savedState.current) return;

    const sequence = ++saveSequence.current;
    setSyncStatus('saving');
    setSyncError(null);

    const timeout = window.setTimeout(() => {
      if (isDemo) {
        window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(normalizeTripState(state)));
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
            void loadTripStateWithRevision(accessToken, planId!).then((latest) => {
              if (!latest) throw new Error('The selected trip plan is no longer available.');
              revision.current = latest.revision;
              savedState.current = ensureActivities(latest.state);
              setState(savedState.current);
              setSyncStatus('error');
              setSyncError('Another collaborator updated this trip. Latest changes were loaded.');
            }).catch(() => {
              setSyncStatus('error');
              setSyncError('Another collaborator updated this trip. Reload the page to get the latest changes.');
            });
            return;
          }
          setSyncStatus('error');
          setSyncError(reason instanceof Error ? reason.message : 'Unable to save the trip.');
        });
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [accessToken, isDemo, isReady, planId, refreshActivity, setPlans, shareToken, state, user.id]);

  const syncNow = useCallback(async () => {
    if (isDemo || shareToken || !planId) return;

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
      setSyncStatus('error');
      setSyncError(reason instanceof Error ? reason.message : 'Unable to save the trip.');
    }
  }, [accessToken, isDemo, planId, refreshActivity, setPlans, shareToken, state]);

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
      setPlanId(nextPlanId);
      revision.current = next.revision;
      savedState.current = ensureActivities(next.state);
      setState(savedState.current);
      window.localStorage.setItem(selectedPlanStorageKey(user.id), nextPlanId);
      setSyncStatus('saved');
    } catch (reason) {
      setSyncStatus('error');
      setSyncError(reason instanceof Error ? reason.message : 'Unable to load the selected trip.');
    } finally {
      setIsReady(true);
    }
  }, [accessToken, isDemo, planId, setPlanId, setState, shareToken, user.id]);

  const createPlan = useCallback(async () => {
    if (isDemo || shareToken) return null;

    const nextState = ensureActivities(ensureItineraryEntries(createBlankTripState()));
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
  }, [accessToken, isDemo, setPlanId, setPlans, setState, shareToken, user.id]);

  return {
    isReady,
    setIsReady,
    syncStatus,
    setSyncStatus,
    syncError,
    setSyncError,
    syncNow,
    persistForCloudSignIn,
    switchPlan,
    createPlan,
    activityEvents,
    refreshActivity,
  };
}
