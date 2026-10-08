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

  it('moves an unscheduled location cluster together by its anchor', () => {
    const { result } = renderHook(() => useTripState(false));
    const anchor = { ...samplePlace, id: 'cluster-anchor', name: 'Cluster anchor' };
    const child = { ...samplePlace, id: 'cluster-child', name: 'Cluster child', category: 'Food' as const };
    act(() => {
      result.current.addPlace(anchor);
      result.current.addPlace(child);
      result.current.setPlaceCluster(child.id, anchor.id, 'inside');
    });

    const dayId = result.current.state.days[0].id;
    act(() => result.current.move(anchor.id, dayId, 0));

    expect(result.current.state.days[0].placeIds.slice(0, 2)).toEqual([anchor.id, child.id]);
    expect(result.current.state.unscheduledIds).not.toEqual(expect.arrayContaining([anchor.id, child.id]));
  });

  it('keeps the creator while recording the latest place editor', () => {
    const { result } = renderHook(() => useTripState(false, { id: 'author-id', email: 'author@example.com' }));
    act(() => result.current.addPlace(samplePlace));
    const saved = result.current.placesById.get('test-place')!;
    expect(saved).toMatchObject({ createdById: 'author-id', createdByEmail: 'author@example.com' });

    act(() => result.current.updatePlace({ ...saved, name: 'Updated place' }));
    expect(result.current.placesById.get('test-place')).toMatchObject({
      createdByEmail: 'author@example.com',
      updatedByEmail: 'author@example.com',
      name: 'Updated place',
    });
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

  it('manages, reorders, and moves day tasks', () => {
    const { result } = renderHook(() => useTripState(false));
    const firstDayId = result.current.state.days[0].id;
    const secondDayId = result.current.state.days[1].id;

    act(() => {
      result.current.addDayTask(firstDayId, 'Bring tickets');
      result.current.addDayTask(firstDayId, 'Pack umbrella');
    });
    const [first, second] = result.current.state.dayTasks!;
    expect(result.current.state.dayTasks?.map((task) => task.text)).toEqual(['Bring tickets', 'Pack umbrella']);

    act(() => {
      result.current.toggleDayTask(first.id);
      result.current.updateDayTask(second.id, 'Pack raincoat');
      result.current.reorderDayTasks(firstDayId, second.id, first.id);
    });
    expect(result.current.state.dayTasks?.find((task) => task.id === first.id)?.completed).toBe(true);
    expect([...result.current.state.dayTasks!].sort((a, b) => a.sortOrder - b.sortOrder).map((task) => task.text))
      .toEqual(['Pack raincoat', 'Bring tickets']);

    act(() => result.current.moveDayTask(first.id, secondDayId));
    expect(result.current.state.dayTasks?.find((task) => task.id === first.id)?.dayId).toBe(secondDayId);
  });

  it('moves tasks to the next day when their day is removed', () => {
    const { result } = renderHook(() => useTripState(false));
    const firstDayId = result.current.state.days[0].id;
    const nextDayId = result.current.state.days[1].id;
    act(() => result.current.addDayTask(firstDayId, 'Carry this forward'));
    act(() => result.current.removeDay(firstDayId));
    expect(result.current.state.dayTasks?.[0]).toMatchObject({ dayId: nextDayId, text: 'Carry this forward' });
  });

  it('undo after a move between days restores both days', () => {
    const { result } = renderHook(() => useTripState(false));
    const [first, second] = result.current.state.days;
    const firstIds = [...first.placeIds];
    const secondIds = [...second.placeIds];
    const moved = firstIds[0];

    act(() => {
      result.current.markUndoPoint('Moved stop');
      result.current.move(moved, second.id, 0);
    });
    expect(result.current.state.days[1].placeIds[0]).toBe(moved);
    expect(result.current.undoLabel).toBe('Moved stop');

    let undone = false;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(true);
    expect(result.current.state.days[0].placeIds).toEqual(firstIds);
    expect(result.current.state.days[1].placeIds).toEqual(secondIds);
    expect(result.current.undoLabel).toBeNull();
  });

  it('an unrelated edit after the undoable action disarms undo and keeps the edit', async () => {
    const { result } = renderHook(() => useTripState(false));
    const [first, second] = result.current.state.days;
    const moved = first.placeIds[0];
    act(() => {
      result.current.markUndoPoint('Moved stop');
      result.current.move(moved, second.id, 0);
    });
    await act(async () => {});
    const edited = { ...result.current.placesById.get(moved)!, notes: 'Bring cash' };
    act(() => { result.current.updatePlace(edited); });

    expect(result.current.undoLabel).toBeNull();
    let undone = true;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(false);
    expect(result.current.placesById.get(moved)?.notes).toBe('Bring cash');
    expect(result.current.state.days[1].placeIds[0]).toBe(moved);
  });

  it('undo twice is a no-op the second time', () => {
    const { result } = renderHook(() => useTripState(false));
    const firstIds = [...result.current.state.days[0].placeIds];
    act(() => {
      result.current.markUndoPoint('Moved stop');
      result.current.move(firstIds[0], 'unscheduled', 0);
    });
    act(() => { result.current.undo(); });
    const afterFirstUndo = result.current.state;

    let undone = true;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(false);
    expect(result.current.state).toBe(afterFirstUndo);
    expect(result.current.state.days[0].placeIds).toEqual(firstIds);
  });

  it('a lifecycle write after marking disarms undo', () => {
    const { result } = renderHook(() => useTripState(false));
    const moved = result.current.state.days[0].placeIds[0];
    act(() => {
      result.current.markUndoPoint('Moved stop');
      result.current.move(moved, 'unscheduled', 0);
    });
    act(() => result.current.setState((current) => ({ ...current, tripName: 'Remote rename' })));
    expect(result.current.undoLabel).toBeNull();

    let undone = true;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(false);
    expect(result.current.state.tripName).toBe('Remote rename');
    expect(result.current.state.unscheduledIds[0]).toBe(moved);
  });

  it('one undo point covers a group of removePlace calls', () => {
    const { result } = renderHook(() => useTripState(false));
    act(() => {
      result.current.addPlace({ ...samplePlace, id: 'group-a' });
      result.current.addPlace({ ...samplePlace, id: 'group-b' });
    });
    const placeIds = result.current.state.places.map((place) => place.id);
    const unscheduledIds = [...result.current.state.unscheduledIds];

    act(() => {
      result.current.markUndoPoint('Place removed');
      result.current.removePlace('group-a');
      result.current.removePlace('group-b');
    });
    expect(result.current.placesById.has('group-a')).toBe(false);
    expect(result.current.placesById.has('group-b')).toBe(false);

    act(() => { result.current.undo(); });
    expect(result.current.state.places.map((place) => place.id)).toEqual(placeIds);
    expect(result.current.state.unscheduledIds).toEqual(unscheduledIds);
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
