import { useCallback, useEffect, useMemo, useState } from 'react';
import { createInitialState } from '../data/seed';
import type { ContainerId, Place, TripState } from '../types';
import { movePlace } from '../utils/itinerary';

const STORAGE_KEY = 'taiwan-trip-planner:v1';

function loadState(): TripState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return createInitialState();
    const parsed = JSON.parse(stored) as TripState;
    return parsed.version === 1 ? parsed : createInitialState();
  } catch {
    return createInitialState();
  }
}

export function useTripPlanner() {
  const [state, setState] = useState<TripState>(loadState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

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
    placesById,
    addPlace,
    updatePlace,
    removePlace,
    addDay,
    updateDayLabel,
    removeDay,
    move,
    updateTrip,
    reset,
  };
}
