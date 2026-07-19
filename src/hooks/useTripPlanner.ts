import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createInitialState } from '../data/seed';
import { useAuth } from '../context/AuthContext';
import type { ContainerId, Place, TripState } from '../types';
import { isTripState, loadTripState, saveTripState } from '../lib/tripRepository';
import { movePlace } from '../utils/itinerary';

const LEGACY_STORAGE_KEY = 'taiwan-trip-planner:v1';
const DEMO_STORAGE_KEY = 'taiwan-trip-planner:demo:v1';
const SAVE_DEBOUNCE_MS = 700;

export type SyncStatus = 'loading' | 'saving' | 'saved' | 'error';

function loadStoredState(key: string): TripState | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as unknown;
    return isTripState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function loadLegacyState(): TripState | null {
  return loadStoredState(LEGACY_STORAGE_KEY);
}

function loadDemoState(): TripState | null {
  return loadStoredState(DEMO_STORAGE_KEY);
}

export function useTripPlanner() {
  const { accessToken, user, isDemo } = useAuth();
  const [state, setState] = useState<TripState>(createInitialState);
  const [isReady, setIsReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const [syncError, setSyncError] = useState<string | null>(null);
  const saveSequence = useRef(0);

  useEffect(() => {
    let active = true;
    setIsReady(false);
    setSyncStatus('loading');
    setSyncError(null);

    async function hydrate() {
      try {
        if (isDemo) {
          setState(loadDemoState() ?? createInitialState());
          setSyncStatus('saved');
          return;
        }

        const remoteState = await loadTripState(accessToken, user.id);
        if (!active) return;

        if (remoteState) {
          setState(remoteState);
        } else {
          const initialState = loadDemoState() ?? loadLegacyState() ?? createInitialState();
          setState(initialState);
          await saveTripState(accessToken, user.id, initialState);
        }

        window.localStorage.removeItem(DEMO_STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        if (active) setSyncStatus('saved');
      } catch (reason) {
        if (!active) return;
        setState(loadLegacyState() ?? createInitialState());
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
  }, [accessToken, isDemo, user.id]);

  useEffect(() => {
    if (!isReady) return;

    const sequence = ++saveSequence.current;
    setSyncStatus('saving');
    setSyncError(null);

    const timeout = window.setTimeout(() => {
      if (isDemo) {
        window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
        if (saveSequence.current === sequence) setSyncStatus('saved');
        return;
      }

      saveTripState(accessToken, user.id, state)
        .then(() => {
          if (saveSequence.current === sequence) setSyncStatus('saved');
        })
        .catch((reason: unknown) => {
          if (saveSequence.current !== sequence) return;
          setSyncStatus('error');
          setSyncError(reason instanceof Error ? reason.message : 'Unable to save the trip.');
        });
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [accessToken, isDemo, isReady, state, user.id]);

  const placesById = useMemo(
    () => new Map(state.places.map((place) => [place.id, place])),
    [state.places],
  );

  const addPlace = useCallback((place: Place) => {
    setState((current) => ({
      ...current,
      places: [...current.places, place],
      unscheduledIds: [...current.unscheduledIds, place.id],
    }));
  }, []);

  const updatePlace = useCallback((place: Place) => {
    setState((current) => ({
      ...current,
      places: current.places.map((item) => (item.id === place.id ? place : item)),
    }));
  }, []);

  const removePlace = useCallback((placeId: string) => {
    setState((current) => ({
      ...current,
      places: current.places.filter((place) => place.id !== placeId),
      unscheduledIds: current.unscheduledIds.filter((id) => id !== placeId),
      days: current.days.map((day) => ({
        ...day,
        placeIds: day.placeIds.filter((id) => id !== placeId),
      })),
    }));
  }, []);

  const addDay = useCallback(() => {
    setState((current) => {
      const dayNumber = current.days.length + 1;
      return {
        ...current,
        days: [
          ...current.days,
          { id: `day-${crypto.randomUUID()}`, label: `Day ${dayNumber}`, placeIds: [] },
        ],
      };
    });
  }, []);

  const updateDayLabel = useCallback((dayId: string, label: string) => {
    setState((current) => ({
      ...current,
      days: current.days.map((day) => (day.id === dayId ? { ...day, label } : day)),
    }));
  }, []);

  const removeDay = useCallback((dayId: string) => {
    setState((current) => {
      const day = current.days.find((item) => item.id === dayId);
      return {
        ...current,
        unscheduledIds: [...current.unscheduledIds, ...(day?.placeIds ?? [])],
        days: current.days.filter((item) => item.id !== dayId),
      };
    });
  }, []);

  const reorderDays = useCallback((fromIndex: number, toIndex: number) => {
    setState((current) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.days.length ||
        toIndex >= current.days.length
      ) {
        return current;
      }

      const days = [...current.days];
      const [movedDay] = days.splice(fromIndex, 1);
      days.splice(toIndex, 0, movedDay);
      return { ...current, days };
    });
  }, []);

  const move = useCallback(
    (placeId: string, destinationId: ContainerId, destinationIndex: number) => {
      setState((current) => movePlace(current, placeId, destinationId, destinationIndex));
    },
    [],
  );

  const updateTrip = useCallback((tripName: string, startDate: string) => {
    setState((current) => ({ ...current, tripName, startDate }));
  }, []);

  const reset = useCallback(() => setState(createInitialState()), []);

  return {
    state,
    isReady,
    syncStatus,
    syncError,
    placesById,
    addPlace,
    updatePlace,
    removePlace,
    addDay,
    updateDayLabel,
    removeDay,
    reorderDays,
    move,
    updateTrip,
    reset,
  };
}
