import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Place } from '../types';
import { useTripState } from './useTripState';

const samplePlace: Place = {
  id: 'test-place',
  name: 'Test Place',
  region: 'Taipei',
  category: 'Landmark',
  latitude: 25.03,
  longitude: 121.56,
  notes: 'Sample note',
};

const accommodation: Place = {
  ...samplePlace,
  id: 'test-accommodation',
  name: 'Test Hotel',
  category: 'Accommodation',
};

describe('useTripState', () => {
  it('initializes with seed data and activities', () => {
    const { result } = renderHook(() => useTripState(false));
    expect(result.current.state.places.length).toBeGreaterThan(0);
    expect(result.current.placesById.size).toBe(result.current.state.places.length);
    expect(result.current.activitiesById.size).toBeGreaterThan(0);
  });

  it('adds place to unscheduled and updates placesById', () => {
    const { result } = renderHook(() => useTripState(false));
    act(() => {
      result.current.addPlace(samplePlace);
    });
    expect(result.current.state.unscheduledIds).toContain('test-place');
    expect(result.current.placesById.get('test-place')).toEqual(samplePlace);
  });

  it('does not mutate state when readOnly is true', () => {
    const { result } = renderHook(() => useTripState(true));
    const initialPlaceCount = result.current.state.places.length;
    act(() => {
      result.current.addPlace(samplePlace);
    });
    expect(result.current.state.places.length).toBe(initialPlaceCount);
  });

  it('manages days (add, update label, remove, reorder)', () => {
    const { result } = renderHook(() => useTripState(false));
    const initialDayCount = result.current.state.days.length;

    act(() => {
      result.current.addDay();
    });
    expect(result.current.state.days.length).toBe(initialDayCount + 1);

    const newDayId = result.current.state.days[result.current.state.days.length - 1].id;
    act(() => {
      result.current.updateDayLabel(newDayId, 'Custom Day');
    });
    expect(result.current.state.days.find((d) => d.id === newDayId)?.label).toBe('Custom Day');

    act(() => {
      result.current.removeDay(newDayId);
    });
    expect(result.current.state.days.length).toBe(initialDayCount);
  });

  it('toggles visited place', () => {
    const { result } = renderHook(() => useTripState(false));
    const placeId = result.current.state.places[0].id;

    act(() => {
      result.current.toggleVisited(placeId);
    });
    expect(result.current.state.visitedPlaceIds).toContain(placeId);

    act(() => {
      result.current.toggleVisited(placeId);
    });
    expect(result.current.state.visitedPlaceIds).not.toContain(placeId);
  });

  it('keeps the hotel source unscheduled and reorders its day occurrence', () => {
    const { result } = renderHook(() => useTripState(false));
    const dayId = result.current.state.days[0].id;
    act(() => {
      result.current.addPlace(accommodation);
      result.current.move(accommodation.id, dayId, 0);
    });

    const occurrenceId = result.current.state.days[0].placeIds[0];
    expect(occurrenceId).not.toBe(accommodation.id);
    expect(result.current.state.unscheduledIds).toContain(accommodation.id);

    act(() => {
      result.current.move(occurrenceId, dayId, result.current.state.days[0].placeIds.length - 1);
    });

    const dayIds = result.current.state.days[0].placeIds;
    expect(dayIds.at(-1)).toBe(occurrenceId);
    expect(result.current.state.places.filter((place) => place.id === accommodation.id)).toHaveLength(1);
    expect(result.current.state.unscheduledIds).toEqual(expect.arrayContaining([accommodation.id]));
  });
  it('keeps a hotel source while removing one planner visit', () => {
    const { result } = renderHook(() => useTripState(false));
    const dayId = result.current.state.days[0].id;
    act(() => {
      result.current.addPlace(accommodation);
      result.current.move(accommodation.id, dayId, 0);
      result.current.move(accommodation.id, dayId, 1);
    });

    const visitIds = result.current.state.days[0].placeIds.filter((id) => id.startsWith('stay-'));
    expect(visitIds).toHaveLength(2);

    act(() => {
      result.current.removePlannerVisit(visitIds[0], dayId);
    });

    expect(result.current.state.places.find((place) => place.id === accommodation.id)).toBeDefined();
    expect(result.current.state.unscheduledIds).toContain(accommodation.id);
    expect(result.current.state.days[0].placeIds).not.toContain(visitIds[0]);
    expect(result.current.state.days[0].placeIds).toContain(visitIds[1]);
  });

  it('removes a hotel source and every linked planner visit', () => {
    const { result } = renderHook(() => useTripState(false));
    const dayId = result.current.state.days[0].id;
    act(() => {
      result.current.addPlace(accommodation);
      result.current.move(accommodation.id, dayId, 0);
      result.current.move(accommodation.id, dayId, 1);
      result.current.removePlace(accommodation.id);
    });

    expect(result.current.state.places.some((place) => place.id === accommodation.id || place.assignmentOf === accommodation.id)).toBe(false);
    expect(result.current.state.unscheduledIds).not.toContain(accommodation.id);
    expect(result.current.state.days[0].placeIds.some((id) => id.startsWith('stay-'))).toBe(false);
  });
});
