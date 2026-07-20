import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createInitialState } from '../data/seed';
import { useAuth } from '../context/AuthContext';
import type { ContainerId, CurrencyCode, DayExecutionState, PlaceholderKind, Place, StopExecutionStatus, StopSchedule, TripExpense, TripState, TravelMode } from '../types';
import { acceptTripInvitations, isTripState, loadPublicTrip, loadSharedTripOwnerId, loadTripState, saveTripState } from '../lib/tripRepository';
import { movePlace } from '../utils/itinerary';
import { defaultDuration, estimateTravelMinutes, toMinutes, toTime } from '../utils/schedule';
import { markRouteStale, routeLegKey } from '../utils/routing';
import { applyAiDraft as applyConfirmedAiDraft } from '../utils/applyAiDraft';
import type { ConfirmedAiDraft } from '../types/aiImport';

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
          executionByDay: parsed.executionByDay ?? {},
          expenses: parsed.expenses ?? [],
          displayCurrency: parsed.displayCurrency ?? 'MYR',
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

export function useTripPlanner(shareToken?: string) {
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
        if (shareToken) {
          const sharedState = await loadPublicTrip(shareToken);
          if (!sharedState) throw new Error('This share link is invalid or no longer available.');
          setState(sharedState);
          setSyncStatus('saved');
          return;
        }

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
  }, [accessToken, isDemo, shareToken, user.id]);

  useEffect(() => {
    if (!isReady || shareToken) return;

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
  }, [accessToken, isDemo, isReady, shareToken, state, tripOwnerId, user.id]);

  const placesById = useMemo(
    () => new Map(state.places.map((place) => [place.id, place])),
    [state.places],
  );

  const addPlace = useCallback((place: Place) => {
    if (shareToken) return;
    setState((current) => ({
      ...current,
      places: [...current.places, place],
      unscheduledIds: [...current.unscheduledIds, place.id],
      hotelPlaceId: place.type === 'hotel' ? place.id : current.hotelPlaceId,
    }));
  }, [shareToken]);

  const addPlaceToDay = useCallback((place: Place, dayId: string) => {
    if (shareToken) return;
    setState((current) => ({
      ...current,
      places: [...current.places, place],
      days: current.days.map((day) => (day.id === dayId ? markRouteStale({ ...day, placeIds: [...day.placeIds, place.id] }) : day)),
      hotelPlaceId: place.type === 'hotel' ? place.id : current.hotelPlaceId,
    }));
  }, [shareToken]);

  const addPlaceholderToDay = useCallback((dayId: string, kind: PlaceholderKind) => {
    if (shareToken) return;
    const placeholder: Place = { id: `placeholder-${crypto.randomUUID()}`, name: kind, region: '', category: 'Relaxation', latitude: 0, longitude: 0, notes: '', type: 'placeholder', placeholderKind: kind };
    setState((current) => ({
      ...current,
      places: [...current.places, placeholder],
      days: current.days.map((day) => day.id === dayId ? markRouteStale({ ...day, placeIds: [...day.placeIds, placeholder.id] }) : day),
    }));
  }, [shareToken]);

  const replacePlaceholder = useCallback((placeholderId: string, place: Place) => {
    if (shareToken) return;
    setState((current) => ({
      ...current,
      places: [...current.places.filter((item) => item.id !== placeholderId), place],
      days: current.days.map((day) => day.placeIds.includes(placeholderId)
        ? markRouteStale({ ...day, placeIds: day.placeIds.map((id) => id === placeholderId ? place.id : id) })
        : day),
    }));
  }, [shareToken]);

  const fillPlaceholder = useCallback((placeholderId: string, placeId: string) => {
    if (shareToken) return;
    setState((current) => {
      const placeholder = current.places.find((place) => place.id === placeholderId);
      const place = current.places.find((item) => item.id === placeId);
      if (placeholder?.type !== 'placeholder' || !place || place.type === 'placeholder') return current;
      return {
        ...current,
        places: current.places.filter((item) => item.id !== placeholderId),
        unscheduledIds: current.unscheduledIds.filter((id) => id !== placeId),
        days: current.days.map((day) => {
          if (day.placeIds.includes(placeholderId)) return markRouteStale({ ...day, placeIds: day.placeIds.filter((id) => id !== placeId).map((id) => id === placeholderId ? placeId : id) });
          return day.placeIds.includes(placeId) ? markRouteStale({ ...day, placeIds: day.placeIds.filter((id) => id !== placeId) }) : day;
        }),
      };
    });
  }, [shareToken]);

  const updatePlace = useCallback((place: Place) => {
    if (shareToken) return;
    setState((current) => ({
      ...current,
      places: current.places.map((item) => (item.id === place.id ? place : item)),
      days: current.days.map((day) => day.placeIds.includes(place.id) ? markRouteStale(day) : day),
      hotelPlaceId: place.type === 'hotel' ? place.id : current.hotelPlaceId === place.id ? undefined : current.hotelPlaceId,
    }));
  }, []);

  const removePlace = useCallback((placeId: string) => {
    if (shareToken) return;
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
    if (shareToken) return;
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
    if (shareToken) return;
    setState((current) => ({
      ...current,
      days: current.days.map((day) => (day.id === dayId ? { ...day, label } : day)),
    }));
  }, []);

  const removeDay = useCallback((dayId: string) => {
    if (shareToken) return;
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
    if (shareToken) return;
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
    if (shareToken) return;
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
    if (shareToken) return;
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
    if (shareToken) return;
    setState((current) => ({
      ...current,
      visitedPlaceIds: current.visitedPlaceIds.includes(placeId)
        ? current.visitedPlaceIds.filter((id) => id !== placeId)
        : [...current.visitedPlaceIds, placeId],
    }));
  }, []);

  const updateExecution = useCallback((dayId: string, placeId: string, status: StopExecutionStatus) => {
    if (shareToken) return;
    setState((current) => {
      const day = current.days.find((item) => item.id === dayId);
      if (!day || !day.placeIds.includes(placeId)) return current;
      const now = new Date().toISOString();
      const previous = current.executionByDay?.[dayId];
      const stopStates = { ...(previous?.stopStates ?? {}) };
      const currentState = stopStates[placeId] ?? { placeId, status: 'upcoming' as const };

      if (status === 'current') {
        Object.entries(stopStates).forEach(([id, item]) => {
          if (id !== placeId && item.status === 'current') stopStates[id] = { ...item, status: 'upcoming' };
        });
      }
      stopStates[placeId] = {
        ...currentState,
        status,
        arrivedAt: status === 'current' ? now : currentState.arrivedAt,
        completedAt: status === 'completed' ? now : currentState.completedAt,
        skippedAt: status === 'skipped' ? now : currentState.skippedAt,
      };

      if (status === 'completed' || status === 'skipped') {
        const nextId = day.placeIds.find((id) => id !== placeId && !['completed', 'skipped', 'rescheduled'].includes(stopStates[id]?.status ?? 'upcoming'));
        if (nextId) stopStates[nextId] = { ...(stopStates[nextId] ?? { placeId: nextId }), status: 'current', arrivedAt: now };
      }

      const execution: DayExecutionState = { dayId, selectedAt: previous?.selectedAt ?? now, stopStates, updatedAt: now };
      return { ...current, executionByDay: { ...current.executionByDay, [dayId]: execution } };
    });
  }, [shareToken]);

  const addExpense = useCallback((expense: TripExpense) => {
    if (shareToken) return;
    setState((current) => ({ ...current, expenses: [...(current.expenses ?? []), expense] }));
  }, [shareToken]);

  const move = useCallback(
    (placeId: string, destinationId: ContainerId, destinationIndex: number) => {
      if (shareToken) return;
      setState((current) => {
        if (destinationId === 'unscheduled' && current.places.find((place) => place.id === placeId)?.type === 'placeholder') return current;
        const moved = movePlace(current, placeId, destinationId, destinationIndex);
        return { ...moved, days: moved.days.map(markRouteStale) };
      });
    },
    [],
  );

  const updateTrip = useCallback((tripName: string, startDate: string, displayCurrency?: CurrencyCode) => {
    if (shareToken) return;
    setState((current) => ({ ...current, tripName, startDate, displayCurrency: displayCurrency ?? current.displayCurrency ?? 'MYR', days: current.days.map(markRouteStale) }));
  }, []);

  const updateLegMode = useCallback((dayId: string, fromPlaceId: string, toPlaceId: string, mode: TravelMode | 'default') => {
    if (shareToken) return;
    const key = routeLegKey(fromPlaceId, toPlaceId);
    setState((current) => ({
      ...current,
      days: current.days.map((day) => day.id === dayId
        ? markRouteStale({ ...day, legModeOverrides: { ...day.legModeOverrides, [key]: mode } })
        : day),
    }));
  }, []);

  const applyAiDraft = useCallback((draft: ConfirmedAiDraft) => {
    if (shareToken || isDemo) return;
    setState((current) => applyConfirmedAiDraft(current, draft));
  }, [isDemo, shareToken]);

  const reset = useCallback(() => { if (!shareToken) setState(createInitialState()); }, [shareToken]);
  const syncNow = useCallback(async () => {
    if (isDemo || shareToken) return;

    setSyncStatus('saving');
    setSyncError(null);
    try {
      await saveTripState(accessToken, tripOwnerId, state);
      setSyncStatus('saved');
    } catch (reason) {
      setSyncStatus('error');
      setSyncError(reason instanceof Error ? reason.message : 'Unable to save the trip.');
    }
  }, [accessToken, isDemo, shareToken, state, tripOwnerId]);
  const persistForCloudSignIn = useCallback(() => {
    if (isDemo) window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  }, [isDemo, state]);

  return {
    state,
    isReady,
    syncStatus,
    syncError,
    isOwner: !shareToken && (isDemo || tripOwnerId === user.id),
    isReadOnly: Boolean(shareToken),
    placesById,
    addPlace,
    addPlaceToDay,
    addPlaceholderToDay,
    replacePlaceholder,
    fillPlaceholder,
    updatePlace,
    removePlace,
    addDay,
    updateDayLabel,
    updateDaySchedule,
    updateStopSchedule,
    removeDay,
    reorderDays,
    toggleVisited,
    updateExecution,
    addExpense,
    move,
    updateTrip,
    updateLegMode,
    applyAiDraft,
    reset,
    syncNow,
    persistForCloudSignIn,
  };
}
