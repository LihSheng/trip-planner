import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createInitialState } from '../data/seed';
import { useAuth } from '../context/AuthContext';
import type { ContainerId, PlaceholderKind, Place, StopSchedule, TripState, TravelMode } from '../types';
import { acceptTripInvitations, isTripState, loadSharedTripOwnerId, loadTripState, saveTripState } from '../lib/tripRepository';
import { movePlace } from '../utils/itinerary';
import { defaultDuration, estimateTravelMinutes, toMinutes, toTime } from '../utils/schedule';
import { markRouteStale, routeLegKey } from '../utils/routing';

const LEGACY_STORAGE_KEY = 'taiwan-trip-planner:v1';
const DEMO_STORAGE_KEY = 'taiwan-trip-planner:demo:v1';
const SAVE_DEBOUNCE_MS = 700;

export type SyncStatus = 'loading' | 'saving' | 'saved' | 'error';

function loadStoredState(key: string): TripState | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as unknown;
    return isTripState(parsed)
      ? {
          ...parsed,
          visitedPlaceIds: parsed.visitedPlaceIds ?? [],
      days: parsed.days.map((day) => ({ ...day, travelMode: day.travelMode ?? 'public', stopSchedules: day.stopSchedules ?? {}, timeManagementEnabled: day.timeManagementEnabled ?? false, legModeOverrides: day.legModeOverrides ?? {} })),
        }
      : null;
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
  const [tripOwnerId, setTripOwnerId] = useState(user.id);
  const saveSequence = useRef(0);

  useEffect(() => {
    let active = true;
    setIsReady(false);
    setSyncStatus('loading');
    setSyncError(null);
    setTripOwnerId(user.id);

    async function hydrate() {
      try {
        if (isDemo) {
          setState(loadDemoState() ?? createInitialState());
          setSyncStatus('saved');
          return;
        }

        await acceptTripInvitations(accessToken);
        const sharedOwnerId = await loadSharedTripOwnerId(accessToken, user.id);
        if (sharedOwnerId) {
          const sharedState = await loadTripState(accessToken, sharedOwnerId);
          if (sharedState) {
            setTripOwnerId(sharedOwnerId);
            setState(sharedState);
            if (active) setSyncStatus('saved');
            return;
          }
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

      saveTripState(accessToken, tripOwnerId, state)
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
  }, [accessToken, isDemo, isReady, state, tripOwnerId, user.id]);

  const placesById = useMemo(
    () => new Map(state.places.map((place) => [place.id, place])),
    [state.places],
  );

  const addPlace = useCallback((place: Place) => {
    setState((current) => ({
      ...current,
      places: [...current.places, place],
      unscheduledIds: [...current.unscheduledIds, place.id],
      hotelPlaceId: place.type === 'hotel' ? place.id : current.hotelPlaceId,
    }));
  }, []);

  const addPlaceToDay = useCallback((place: Place, dayId: string) => {
    setState((current) => ({
      ...current,
      places: [...current.places, place],
      days: current.days.map((day) => (day.id === dayId ? markRouteStale({ ...day, placeIds: [...day.placeIds, place.id] }) : day)),
      hotelPlaceId: place.type === 'hotel' ? place.id : current.hotelPlaceId,
    }));
  }, []);

  const addPlaceholderToDay = useCallback((dayId: string, kind: PlaceholderKind) => {
    const placeholder: Place = { id: `placeholder-${crypto.randomUUID()}`, name: kind, region: '', category: 'Relaxation', latitude: 0, longitude: 0, notes: '', type: 'placeholder', placeholderKind: kind };
    setState((current) => ({
      ...current,
      places: [...current.places, placeholder],
      days: current.days.map((day) => day.id === dayId ? markRouteStale({ ...day, placeIds: [...day.placeIds, placeholder.id] }) : day),
    }));
  }, []);

  const replacePlaceholder = useCallback((placeholderId: string, place: Place) => {
    setState((current) => ({
      ...current,
      places: [...current.places.filter((item) => item.id !== placeholderId), place],
      days: current.days.map((day) => day.placeIds.includes(placeholderId)
        ? markRouteStale({ ...day, placeIds: day.placeIds.map((id) => id === placeholderId ? place.id : id) })
        : day),
    }));
  }, []);

  const updatePlace = useCallback((place: Place) => {
    setState((current) => ({
      ...current,
      places: current.places.map((item) => (item.id === place.id ? place : item)),
      days: current.days.map((day) => day.placeIds.includes(place.id) ? markRouteStale(day) : day),
      hotelPlaceId: place.type === 'hotel' ? place.id : current.hotelPlaceId === place.id ? undefined : current.hotelPlaceId,
    }));
  }, []);

  const removePlace = useCallback((placeId: string) => {
    setState((current) => ({
      ...current,
      places: current.places.filter((place) => place.id !== placeId),
      unscheduledIds: current.unscheduledIds.filter((id) => id !== placeId),
      visitedPlaceIds: current.visitedPlaceIds.filter((id) => id !== placeId),
      hotelPlaceId: current.hotelPlaceId === placeId ? undefined : current.hotelPlaceId,
      days: current.days.map((day) => markRouteStale({
        ...day,
        placeIds: day.placeIds.filter((id) => id !== placeId),
        lodgingPlaceId: day.lodgingPlaceId === placeId ? undefined : day.lodgingPlaceId,
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
          { id: `day-${crypto.randomUUID()}`, label: `Day ${dayNumber}`, placeIds: [], travelMode: 'public', stopSchedules: {}, timeManagementEnabled: false },
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

  const updateDaySchedule = useCallback((dayId: string, updates: { travelMode?: TravelMode; startTime?: string; lodgingPlaceId?: string; timeManagementEnabled?: boolean }) => {
    setState((current) => {
      const placesById = new Map(current.places.map((place) => [place.id, place]));
      return {
        ...current,
        days: current.days.map((day) => {
          if (day.id !== dayId) return day;
          const firstPlaceId = day.placeIds[0];
          const firstPlace = firstPlaceId ? placesById.get(firstPlaceId) : undefined;
          const stopSchedules = { ...day.stopSchedules };
          if (updates.startTime && firstPlace && !stopSchedules[firstPlace.id]?.startTime) {
            stopSchedules[firstPlace.id] = { ...stopSchedules[firstPlace.id], startTime: updates.startTime, durationMinutes: defaultDuration(firstPlace.category) };
          }
          return markRouteStale({ ...day, ...updates, stopSchedules });
        }),
      };
    });
  }, []);

  const updateStopSchedule = useCallback((dayId: string, placeId: string, updates: StopSchedule) => {
    setState((current) => {
      const placesById = new Map(current.places.map((place) => [place.id, place]));
      return {
        ...current,
        days: current.days.map((day) => {
          if (day.id !== dayId) return day;
          const stopSchedules = { ...day.stopSchedules, [placeId]: { ...day.stopSchedules?.[placeId], ...updates } };
          const startIndex = day.placeIds.indexOf(placeId);
          const firstPlace = placesById.get(placeId);
          let nextStart = firstPlace && toMinutes(stopSchedules[placeId].startTime);
          let previousPlace = firstPlace;
          if (nextStart !== null && nextStart !== undefined && previousPlace && startIndex >= 0) {
            nextStart += stopSchedules[placeId].durationMinutes ?? defaultDuration(previousPlace.category);
            for (const nextPlaceId of day.placeIds.slice(startIndex + 1)) {
              const nextPlace = placesById.get(nextPlaceId);
              if (!nextPlace) continue;
              nextStart += estimateTravelMinutes(previousPlace, nextPlace, day.travelMode);
              if (stopSchedules[nextPlaceId]?.startTime) break;
              stopSchedules[nextPlaceId] = { ...stopSchedules[nextPlaceId], startTime: toTime(nextStart), durationMinutes: stopSchedules[nextPlaceId]?.durationMinutes ?? defaultDuration(nextPlace.category) };
              nextStart += stopSchedules[nextPlaceId].durationMinutes ?? defaultDuration(nextPlace.category);
              previousPlace = nextPlace;
            }
          }
          return markRouteStale({ ...day, stopSchedules });
        }),
      };
    });
  }, []);

  const toggleVisited = useCallback((placeId: string) => {
    setState((current) => ({
      ...current,
      visitedPlaceIds: current.visitedPlaceIds.includes(placeId)
        ? current.visitedPlaceIds.filter((id) => id !== placeId)
        : [...current.visitedPlaceIds, placeId],
    }));
  }, []);

  const move = useCallback(
    (placeId: string, destinationId: ContainerId, destinationIndex: number) => {
      setState((current) => {
        if (destinationId === 'unscheduled' && current.places.find((place) => place.id === placeId)?.type === 'placeholder') return current;
        const moved = movePlace(current, placeId, destinationId, destinationIndex);
        return { ...moved, days: moved.days.map(markRouteStale) };
      });
    },
    [],
  );

  const updateTrip = useCallback((tripName: string, startDate: string) => {
    setState((current) => ({ ...current, tripName, startDate, days: current.days.map(markRouteStale) }));
  }, []);

  const updateLegMode = useCallback((dayId: string, fromPlaceId: string, toPlaceId: string, mode: TravelMode | 'default') => {
    const key = routeLegKey(fromPlaceId, toPlaceId);
    setState((current) => ({
      ...current,
      days: current.days.map((day) => day.id === dayId
        ? markRouteStale({ ...day, legModeOverrides: { ...day.legModeOverrides, [key]: mode } })
        : day),
    }));
  }, []);

  const reset = useCallback(() => setState(createInitialState()), []);
  const syncNow = useCallback(async () => {
    if (isDemo) return;

    setSyncStatus('saving');
    setSyncError(null);
    try {
      await saveTripState(accessToken, tripOwnerId, state);
      setSyncStatus('saved');
    } catch (reason) {
      setSyncStatus('error');
      setSyncError(reason instanceof Error ? reason.message : 'Unable to save the trip.');
    }
  }, [accessToken, isDemo, state, tripOwnerId]);
  const persistForCloudSignIn = useCallback(() => {
    if (isDemo) window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  }, [isDemo, state]);

  return {
    state,
    isReady,
    syncStatus,
    syncError,
    isOwner: isDemo || tripOwnerId === user.id,
    placesById,
    addPlace,
    addPlaceToDay,
    addPlaceholderToDay,
    replacePlaceholder,
    updatePlace,
    removePlace,
    addDay,
    updateDayLabel,
    updateDaySchedule,
    updateStopSchedule,
    removeDay,
    reorderDays,
    toggleVisited,
    move,
    updateTrip,
    updateLegMode,
    reset,
    syncNow,
    persistForCloudSignIn,
  };
}
